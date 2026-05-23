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