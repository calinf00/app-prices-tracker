import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import OpenAI from "openai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SimilarityCandidate {
  existingProductId: string;
  existingProductName: string;
  newProductName: string;
  score: number;
}

const inputSchema = z.object({
  newProductNames: z.array(z.string().min(1).max(200)).min(1).max(100),
  existingProducts: z
    .array(z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }))
    .min(1)
    .max(500),
});

function extractJson(raw: string): unknown | null {
  if (!raw) return null;
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    // try object wrapper { matches: [...] }
    const oStart = cleaned.indexOf("{");
    const oEnd = cleaned.lastIndexOf("}");
    if (oStart === -1 || oEnd === -1) return null;
    cleaned = cleaned.substring(oStart, oEnd + 1);
  } else {
    cleaned = cleaned.substring(start, end + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export const findSimilarProductsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<{ candidates: SimilarityCandidate[] }> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY non configurata");
    const client = new OpenAI({ apiKey: key });

    const prompt = `Sei un assistente per la gestione della spesa. Confronta i seguenti prodotti nuovi con quelli esistenti e identifica eventuali prodotti identici o molto simili (stesso prodotto, marca simile, formato diverso conta come simile se il nome è quasi uguale).

Prodotti nuovi: ${JSON.stringify(data.newProductNames)}
Prodotti esistenti: ${JSON.stringify(data.existingProducts)}

Rispondi SOLO con un oggetto JSON nel formato:
{"matches":[{"newName":"...","existingId":"...","existingName":"...","score":0.95}]}

Includi solo le coppie con score >= 0.75. Se non ci sono somiglianze, rispondi con {"matches":[]}.`;

    let raw = "";
    try {
      const completion = await client.chat.completions.create(
        {
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Sei un esperto di catalogazione prodotti alimentari italiani. Rispondi solo con JSON valido.",
            },
            { role: "user", content: prompt },
          ],
        },
        { timeout: 30000 },
      );
      raw = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("[findSimilarProducts] OpenAI error", err);
      return { candidates: [] };
    }

    const parsed = extractJson(raw) as
      | { matches?: Array<{ newName?: string; existingId?: string; existingName?: string; score?: number }> }
      | Array<{ newName?: string; existingId?: string; existingName?: string; score?: number }>
      | null;
    if (!parsed) return { candidates: [] };
    const arr = Array.isArray(parsed) ? parsed : (parsed.matches ?? []);

    const existingIds = new Set(data.existingProducts.map((p) => p.id));
    const newSet = new Set(data.newProductNames);

    const candidates: SimilarityCandidate[] = [];
    for (const m of arr) {
      const score = Number(m.score);
      if (!m.existingId || !m.newName || !Number.isFinite(score)) continue;
      if (score < 0.75) continue;
      if (!existingIds.has(m.existingId)) continue;
      if (!newSet.has(m.newName)) continue;
      candidates.push({
        existingProductId: m.existingId,
        existingProductName: m.existingName ?? "",
        newProductName: m.newName,
        score: Math.min(1, score),
      });
    }
    return { candidates };
  });

/** Pair of products in the catalog that look like the same product. */
export interface CatalogDuplicatePair {
  idA: string;
  nameA: string;
  idB: string;
  nameB: string;
  score: number;
  reason: string;
}

const catalogInputSchema = z.object({
  products: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200),
        brand: z.string().max(200).nullable().optional(),
      }),
    )
    .min(2)
    .max(400),
});

export const findCatalogDuplicatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => catalogInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ pairs: CatalogDuplicatePair[] }> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY non configurata");
    const client = new OpenAI({ apiKey: key });

    const prompt = `Sei un assistente per l'analisi della spesa. Analizza questi prodotti e identifica coppie che potrebbero essere lo stesso prodotto (stesso articolo, eventualmente con nome leggermente diverso, abbreviato, o con errori OCR tipici degli scontrini).

Prodotti: ${JSON.stringify(data.products)}

Rispondi SOLO con un oggetto JSON nel formato:
{"pairs":[{"idA":"...","nameA":"...","idB":"...","nameB":"...","score":0.92,"reason":"stesso prodotto, nome abbreviato sullo scontrino"}]}

Includi solo coppie con score >= 0.75. Se non ci sono somiglianze, rispondi {"pairs":[]}.`;

    let raw = "";
    try {
      const completion = await client.chat.completions.create(
        {
          model: "gpt-4o-mini",
          temperature: 0,
          max_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Sei un esperto di catalogazione prodotti alimentari italiani. Rispondi solo con JSON valido.",
            },
            { role: "user", content: prompt },
          ],
        },
        { timeout: 45000 },
      );
      raw = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error("[findCatalogDuplicates] OpenAI error", err);
      return { pairs: [] };
    }

    const parsed = extractJson(raw) as
      | { pairs?: Array<any> }
      | Array<any>
      | null;
    if (!parsed) return { pairs: [] };
    const arr = Array.isArray(parsed) ? parsed : (parsed.pairs ?? []);
    const idSet = new Set(data.products.map((p) => p.id));
    const seen = new Set<string>();
    const out: CatalogDuplicatePair[] = [];
    for (const m of arr) {
      const score = Number(m?.score);
      if (!m?.idA || !m?.idB || m.idA === m.idB) continue;
      if (!Number.isFinite(score) || score < 0.75) continue;
      if (!idSet.has(m.idA) || !idSet.has(m.idB)) continue;
      const key = [m.idA, m.idB].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        idA: m.idA,
        nameA: String(m.nameA ?? ""),
        idB: m.idB,
        nameB: String(m.nameB ?? ""),
        score: Math.min(1, score),
        reason: String(m.reason ?? ""),
      });
    }
    return { pairs: out };
  });