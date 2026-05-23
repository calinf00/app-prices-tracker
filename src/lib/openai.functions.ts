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
            "Sei un assistente specializzato nell'analisi di scontrini italiani. Analizza l'immagine e restituisci ESCLUSIVAMENTE un JSON valido (senza markdown, senza testo aggiuntivo) con questa struttura: { \"negozio\": string, \"data\": string (formato DD/MM/YYYY o vuota se non visibile), \"prodotti\": [ { \"nome\": string, \"quantita\": number, \"unita\": string, \"prezzo_unitario\": number, \"prezzo_totale\": number } ] }",
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
        prodotti?: Array<{
          nome?: string;
          quantita?: number;
          unita?: string;
          prezzo_unitario?: number;
          prezzo_totale?: number;
        }>;
      };
      // Convert DD/MM/YYYY -> YYYY-MM-DD for DB compatibility
      let isoDate: string | null = null;
      const m = (parsed.data ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) isoDate = `${m[3]}-${m[2]}-${m[1]}`;
      return {
        store_name: parsed.negozio?.trim() || null,
        purchase_date: isoDate,
        items: (parsed.prodotti ?? []).map((p) => ({
          name: (p.nome ?? "").trim(),
          quantity: Number(p.quantita) || 1,
          unit: p.unita?.trim() || null,
          price: Number(p.prezzo_unitario ?? p.prezzo_totale) || 0,
        })).filter((it) => it.name),
      };
    } catch {
      return { store_name: null, purchase_date: null, items: [] };
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