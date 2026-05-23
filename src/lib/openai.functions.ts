import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import OpenAI from "openai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY non configurata");
  return new OpenAI({ apiKey: key });
}

const scanInput = z.object({
  imageBase64: z.string().min(20).max(15_000_000),
});

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => scanInput.parse(input))
  .handler(async ({ data }) => {
    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Sei un esperto nell'analisi di scontrini italiani. Il tuo compito è estrarre le informazioni dallo scontrino e restituire ESCLUSIVAMENTE un JSON valido senza markdown. Per i nomi dei prodotti: espandi le abbreviazioni comuni degli scontrini italiani nel nome completo e comprensibile (es. 'PAST.BARILLA SPG 500' diventa 'Pasta Barilla Spaghetti 500g', 'LATT.PARMALAT PS' diventa 'Latte Parmalat Parzialmente Scremato'). Usa il contesto e la logica per completare nomi troncati. Struttura JSON richiesta: { negozio: string, data: string (formato DD/MM/YYYY, stringa vuota se non visibile), totale: number, prodotti: [ { nome_originale: string (testo esatto sullo scontrino), nome_completo: string (nome espanso e comprensibile), quantita: number, unita: string (pz/kg/g/l/ml), prezzo_unitario: number, prezzo_totale: number, categoria_suggerita: string } ] }",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analizza questo scontrino ed estrai i prodotti." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.imageBase64}` } },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as {
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
      return {
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
    } catch {
      return { store_name: null, purchase_date: null, total: null, items: [] };
    }
  });

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
  .handler(async ({ data }) => {
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