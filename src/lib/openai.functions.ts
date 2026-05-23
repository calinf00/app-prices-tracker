import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import OpenAI from "openai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY non configurata");
  return new OpenAI({ apiKey: key });
}

// Per-user, per-function sliding-window rate limit. Counts rows in the
// `ai_rate_limits` table for the current user within `windowMs`, throws
// a user-friendly Italian error when the cap is exceeded, and otherwise
// records the new call. RLS scopes inserts/reads to the calling user.
async function enforceRateLimit(
  supabase: any,
  userId: string,
  fnName: string,
  max: number,
  windowMs: number,
) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await supabase
    .from("ai_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("fn_name", fnName)
    .gte("called_at", since);
  if (error) {
    // Fail-open on the limiter itself (the table may not exist yet on a
    // fresh project), but log so operators can spot it.
    console.error("[rate-limit lookup failed]", error);
    return;
  }
  if ((count ?? 0) >= max) {
    throw new Error(
      `Limite di utilizzo raggiunto per questa funzione (${max} chiamate / ${Math.round(
        windowMs / 3600000,
      )}h). Riprova più tardi.`,
    );
  }
  await supabase.from("ai_rate_limits").insert({ user_id: userId, fn_name: fnName });
}

const scanInput = z.object({
  // Accept either a single image (legacy) or an array of up to 5 images.
  imageBase64: z.string().min(20).max(2_800_000).optional(),
  imagesBase64: z.array(z.string().min(20).max(2_800_000)).min(1).max(5).optional(),
}).refine((v) => !!v.imageBase64 || (v.imagesBase64 && v.imagesBase64.length > 0), {
  message: "Almeno un'immagine richiesta",
});

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scanInput.parse(input))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context.supabase, context.userId, "scanReceipt", 20, 24 * 3600_000);
    const client = getClient();
    const images = data.imagesBase64 ?? (data.imageBase64 ? [data.imageBase64] : []);
    console.log("[scanReceipt] start, images count:", images.length);
    for (const b64 of images) {
      const sizeKB = Math.round((b64.length * 0.75) / 1024);
      console.log(`[scanReceipt] immagine ${sizeKB}KB`);
      if (sizeKB > 1900) {
        throw new Error(
          `Immagine troppo grande (${sizeKB}KB). Riprova con una foto meno dettagliata o usa il ritaglio per selezionare solo lo scontrino.`,
        );
      }
    }
    const promptText =
      images.length > 1
        ? "Queste immagini appartengono allo STESSO scontrino italiano (parti diverse o pagine multiple). Analizzale tutte insieme ed estrai un UNICO elenco prodotti, eliminando i duplicati. Restituisci SOLO un JSON valido senza markdown con questa struttura: { negozio: string, data: string (DD/MM/YYYY), totale: number, prodotti: [ { nome_originale: string, nome_completo: string, quantita: number, unita: string (pz/kg/g/l/ml), prezzo_unitario: number, prezzo_totale: number, categoria_suggerita: string } ] }"
        : "Analizza questo scontrino italiano e restituisci SOLO un JSON valido senza markdown con questa struttura: { negozio: string, data: string (DD/MM/YYYY), totale: number, prodotti: [ { nome_originale: string, nome_completo: string, quantita: number, unita: string (pz/kg/g/l/ml), prezzo_unitario: number, prezzo_totale: number, categoria_suggerita: string } ] }";
    let completion;
    try {
      console.log("[scanReceipt] calling OpenAI...");
      completion = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4000,
        messages: [
          {
            role: "system",
            content:
              "Sei un motore OCR esperto di scontrini italiani. Leggi attentamente tutte le righe prodotto, incluse abbreviazioni, codici tagliati, colonne quantità/prezzo e righe stampate in piccolo. Non ignorare le righe solo perché il testo è parziale: ricostruisci il nome più probabile. Estrai almeno tutte le righe con un prezzo a destra sopra il totale/fiscale. Restituisci ESCLUSIVAMENTE un JSON valido senza markdown né testo extra. Per i nomi: espandi le abbreviazioni comuni (es. 'PAST.BARILLA SPG 500' → 'Pasta Barilla Spaghetti 500g').",
          },
          {
            role: "user",
            content: [
              ...images.map((b64) => ({
                type: "image_url" as const,
                image_url: {
                  url: `data:image/jpeg;base64,${b64}`,
                  detail: "high" as const,
                },
              })),
              { type: "text" as const, text: `${promptText}\n\nRegole importanti: se lo scontrino è leggibile ma non sei sicuro di un prodotto, includilo comunque con il nome più fedele possibile invece di restituire lista vuota. Escludi solo subtotali, totale, IVA, pagamento, resto, punti e messaggi promozionali.` },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }, { timeout: 60000 });
      console.log("[scanReceipt] OpenAI response received");
    } catch (err: any) {
      console.error("[scanReceipt] error:", err?.message, err?.status);
      throw new Error("Errore di connessione all'AI");
    }
    const raw = completion.choices[0]?.message?.content ?? "";
    console.log("[scanReceipt] raw response:", raw);
    const cleaned = extractJsonFromResponse(raw);
    if (!cleaned) {
      throw new Error("L'AI non ha restituito un formato valido, riprova");
    }
    try {
      const parsed = cleaned as {
        negozio?: string;
        data?: string;
        totale?: number;
        prodotti?: Array<{
          nome?: string;
          nome_originale?: string;
          nome_completo?: string;
          quantita?: number;
          unita?: string;
          prezzo_unitario?: number;
          prezzo_totale?: number;
          categoria_suggerita?: string;
        }>;
      };
      let isoDate: string | null = null;
      const m = (parsed.data ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) isoDate = `${m[3]}-${m[2]}-${m[1]}`;
      const result = {
        store_name: parsed.negozio?.trim() || null,
        purchase_date: isoDate,
        total: Number(parsed.totale) || null,
        items: (parsed.prodotti ?? []).map((p) => ({
          name_original: (p.nome_originale ?? p.nome ?? "").trim(),
          name_full: (p.nome_completo ?? p.nome_originale ?? p.nome ?? "").trim(),
          quantity: Number(p.quantita) || 1,
          unit: p.unita?.trim() || "pz",
          price: Number(p.prezzo_unitario ?? p.prezzo_totale) || 0,
          price_total: Number(p.prezzo_totale) || 0,
          category: p.categoria_suggerita?.trim() || "Altro",
        })).filter((it) => it.name_full),
      };
      console.log("[scanReceipt] parsed items:", result.items.length);
      return result;
    } catch (err) {
      console.error("[scanReceipt] shape error:", err);
      throw new Error("L'AI non ha restituito un formato valido, riprova");
    }
  });

// Strip markdown code fences and extract the first JSON object/array.
// Returns the parsed value or null if no valid JSON could be recovered.
function extractJsonFromResponse(response: string): any | null {
  if (!response) return null;
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const startObj = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start === -1) return null;
  const openChar = cleaned[start];
  const closeChar = openChar === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1 || end < start) return null;
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const repaired = cleaned
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, "");
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

const chatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
});

export const chatAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => chatInput.parse(input))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context.supabase, context.userId, "chatAssistant", 60, 3600_000);
    const client = getClient();
    const { supabase } = context;

    const [{ data: purchases }, { data: products }] = await Promise.all([
      supabase
        .from("purchases")
        .select("product_id, store_name, price, quantity, unit, purchase_date")
        .order("purchase_date", { ascending: false })
        .limit(200),
      supabase.from("products").select("id, name, brand, category").limit(200),
    ]);

    const productsById = new Map((products ?? []).map((p: any) => [p.id, p]));
    const enriched = (purchases ?? []).map((p: any) => ({
      ...p,
      product: productsById.get(p.product_id) ?? null,
    }));

    const systemPrompt = `Sei un assistente personale per la spesa. Rispondi in italiano in modo conciso. Hai accesso allo storico acquisti dell'utente (formato JSON qui sotto). Usa questi dati per rispondere a domande su prezzi, negozi convenienti, abitudini di spesa. Se la domanda non è collegata, rispondi normalmente.\n\nSTORICO ACQUISTI:\n${JSON.stringify(enriched).slice(0, 30000)}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }, ...data.messages],
    });
    return { reply: completion.choices[0]?.message?.content ?? "" };
  });

const estimateInput = z.object({
  productName: z.string().min(1).max(200),
});

export const estimatePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => estimateInput.parse(input))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context.supabase, context.userId, "estimatePrice", 120, 3600_000);
    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Sei un esperto di prezzi della grande distribuzione italiana. Per il prodotto fornito dall'utente, fornisci una stima della fascia di prezzo tipica nei supermercati italiani nel 2024-2025. Rispondi SOLO con un JSON: { prezzo_minimo: number, prezzo_massimo: number, unita: string }. Basa la risposta su prezzi realistici per supermercati come Esselunga, Conad, Coop, Lidl.",
        },
        { role: "user", content: data.productName },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw);
      return {
        min: Number(parsed.prezzo_minimo) || 0,
        max: Number(parsed.prezzo_massimo) || 0,
        unit: String(parsed.unita ?? "pz"),
      };
    } catch {
      return { min: 0, max: 0, unit: "pz" };
    }
  });

const smartInput = z.object({
  thresholdDays: z.number().min(1).max(180).default(14),
});

export const smartShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => smartInput.parse(input))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(context.supabase, context.userId, "smartShoppingList", 30, 3600_000);
    const client = getClient();
    const { supabase } = context;

    const [{ data: purchases }, { data: products }, { data: listItems }] = await Promise.all([
      supabase
        .from("purchases")
        .select("product_id, store_name, price, quantity, purchase_date")
        .order("purchase_date", { ascending: false })
        .limit(500),
      supabase.from("products").select("id, name, category").limit(500),
      supabase.from("shopping_list").select("product_name"),
    ]);

    const productsById = new Map((products ?? []).map((p: any) => [p.id, p]));
    const inList = new Set(
      (listItems ?? []).map((i: any) => String(i.product_name).toLowerCase().trim()),
    );

    const byProduct = new Map<string, { name: string; dates: string[] }>();
    (purchases ?? []).forEach((p: any) => {
      const prod = productsById.get(p.product_id);
      if (!prod) return;
      const entry = byProduct.get(p.product_id) ?? { name: String(prod.name), dates: [] as string[] };
      entry.dates.push(String(p.purchase_date));
      byProduct.set(p.product_id, entry);
    });

    const summary = Array.from(byProduct.values()).map((e) => {
      const dates = e.dates.map((d) => new Date(d).getTime()).sort((a, b) => b - a);
      const lastDays = dates[0] ? Math.round((Date.now() - dates[0]) / 86400000) : null;
      const gaps: number[] = [];
      for (let i = 0; i < dates.length - 1; i++) {
        gaps.push(Math.round((dates[i] - dates[i + 1]) / 86400000));
      }
      const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
      return {
        nome: e.name,
        acquisti: dates.length,
        ultimo_giorni_fa: lastDays,
        frequenza_media_giorni: avgGap,
        in_lista: inList.has(e.name.toLowerCase().trim()),
      };
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sei un assistente che genera liste della spesa intelligenti basandosi sullo storico acquisti dell'utente. Soglia configurata: ${data.thresholdDays} giorni. Analizza i dati e suggerisci prodotti che: 1) sono acquistati con frequenza regolare e stanno per scadere il ciclo, 2) non sono stati comprati da più di ${data.thresholdDays} giorni, 3) sono frequenti ma non già in lista. Escludi prodotti già nella lista (in_lista: true). Rispondi SOLO con un JSON: { suggerimenti: [ { nome: string, motivo: string } ] }. Massimo 15 suggerimenti, ordinati per priorità.`,
        },
        { role: "user", content: JSON.stringify(summary).slice(0, 20000) },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw);
      const suggestions = ((parsed.suggerimenti ?? []) as any[])
        .map((s) => ({
          name: String(s?.nome ?? "").trim(),
          reason: String(s?.motivo ?? "").trim(),
        }))
        .filter((s) => s.name);
      return { suggestions };
    } catch {
      return { suggestions: [] };
    }
  });