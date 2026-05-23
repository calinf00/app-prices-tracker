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
            "Sei un assistente che analizza scontrini italiani. Restituisci un JSON con la struttura: {\"store_name\": string|null, \"purchase_date\": string YYYY-MM-DD|null, \"items\": [{\"name\": string, \"quantity\": number, \"unit\": string|null, \"price\": number}]}. I prezzi sono in euro. Se non riesci a leggere lo scontrino restituisci items vuoto.",
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
      return JSON.parse(raw) as {
        store_name: string | null;
        purchase_date: string | null;
        items: Array<{ name: string; quantity: number; unit: string | null; price: number }>;
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