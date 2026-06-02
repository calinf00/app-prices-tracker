import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ productId: z.string().uuid() });

const FIRECRAWL_API_URL = "https://api.firecrawl.dev";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Search the web for a real product photo and attach it to the product.
 * Uses Firecrawl image search via the Lovable connector gateway, then
 * downloads the first valid candidate and uploads it to the
 * `product-images` bucket under the current user's folder.
 */
export const findProductImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
    if (!FIRECRAWL_API_KEY)
      throw new Error("Connettore Firecrawl non configurato");

    // 1. Load product
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, name, brand, category, image_url")
      .eq("id", data.productId)
      .single();
    if (pErr || !product) throw new Error("Prodotto non trovato");

    // 2. Build search query
    const queryParts = [product.brand, product.name, product.category]
      .filter(Boolean)
      .map((s) => String(s).trim());
    const query = `${queryParts.join(" ")} prodotto foto`.trim();
    if (!query || query.length < 3)
      throw new Error("Descrizione prodotto insufficiente per la ricerca");

    // 3. Call Firecrawl image search via gateway
    const searchRes = await fetch(`${FIRECRAWL_API_URL}/v2/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 10,
        sources: ["images"],
      }),
    });

    if (searchRes.status === 402) {
      throw new Error(
        "Crediti Firecrawl esauriti. Ricarica nella workspace per continuare.",
      );
    }
    if (!searchRes.ok) {
      const errText = await searchRes.text().catch(() => "");
      console.error("[findProductImage] firecrawl search failed", searchRes.status, errText);
      throw new Error(`Ricerca fallita (${searchRes.status})`);
    }

    const searchJson = (await searchRes.json()) as {
      data?: { images?: Array<{ url?: string; imageUrl?: string; title?: string }> };
    };
    const images = searchJson.data?.images ?? [];
    const candidates = images
      .map((it) => it.imageUrl || it.url)
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));

    if (candidates.length === 0)
      throw new Error("Nessuna foto trovata. Prova a caricarne una manualmente.");

    // 4. Try candidates until one downloads as a valid image
    let downloaded: { bytes: Uint8Array; contentType: string } | null = null;
    for (const url of candidates) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableBot/1.0)" },
        });
        if (!r.ok) continue;
        const ct = (r.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (!ALLOWED_TYPES.has(ct)) continue;
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) continue;
        downloaded = { bytes: buf, contentType: ct === "image/jpg" ? "image/jpeg" : ct };
        break;
      } catch (e) {
        console.warn("[findProductImage] candidate failed", url, e);
      }
    }

    if (!downloaded)
      throw new Error("Impossibile scaricare le foto trovate. Riprova o caricane una manualmente.");

    // 5. Upload to storage
    const ext = downloaded.contentType === "image/png"
      ? "png"
      : downloaded.contentType === "image/webp"
        ? "webp"
        : "jpg";
    const path = `${userId}/${product.id}-ai-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, downloaded.bytes, {
        contentType: downloaded.contentType,
        upsert: true,
      });
    if (upErr) {
      console.error("[findProductImage] upload failed", upErr);
      throw new Error("Errore salvataggio foto");
    }

    const { data: pub } = supabase.storage
      .from("product-images")
      .getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // 6. Update product row
    const { error: updErr } = await supabase
      .from("products")
      .update({ image_url: publicUrl })
      .eq("id", product.id)
      .select("id");
    if (updErr) {
      console.error("[findProductImage] product update failed", updErr);
      throw new Error("Errore aggiornamento prodotto");
    }

    // 7. Best-effort cleanup of previous image
    const oldUrl = product.image_url;
    if (oldUrl) {
      const marker = "/storage/v1/object/public/product-images/";
      const idx = oldUrl.indexOf(marker);
      if (idx >= 0) {
        const oldPath = oldUrl.slice(idx + marker.length);
        if (oldPath !== path) {
          await supabase.storage
            .from("product-images")
            .remove([oldPath])
            .catch((e) => console.warn("[findProductImage] cleanup failed", e));
        }
      }
    }

    return { imageUrl: publicUrl };
  });