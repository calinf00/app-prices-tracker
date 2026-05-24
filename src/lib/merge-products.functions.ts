import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const mergeInput = z.object({
  mergedProductId: z.string().uuid(),
  canonicalProductId: z.string().uuid(),
});

/**
 * Soft-merge a duplicate product into a canonical one.
 * - Repoints `purchases` and `shopping_list` rows from merged → canonical
 * - Marks the merged product with `merged_into = canonical`
 * - Records the mapping in `product_merge_map`
 * The duplicate row is preserved (soft merge); querying purchases will now
 * roll up under the canonical product.
 */
export const mergeProductsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => mergeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.mergedProductId === data.canonicalProductId) {
      throw new Error("Impossibile unire un prodotto con se stesso");
    }

    // Repoint purchases
    const { error: e1 } = await supabase
      .from("purchases")
      .update({ product_id: data.canonicalProductId })
      .eq("product_id", data.mergedProductId)
      .eq("user_id", userId);
    if (e1) throw new Error(`Errore aggiornamento acquisti: ${e1.message}`);

    // Repoint shopping_list
    const { error: e2 } = await supabase
      .from("shopping_list")
      .update({ product_id: data.canonicalProductId })
      .eq("product_id", data.mergedProductId)
      .eq("user_id", userId);
    if (e2) console.warn("[mergeProducts] shopping_list update warn", e2.message);

    // Mark soft-merge
    const { error: e3 } = await supabase
      .from("products")
      .update({ merged_into: data.canonicalProductId })
      .eq("id", data.mergedProductId)
      .eq("user_id", userId);
    if (e3) throw new Error(`Errore aggiornamento prodotto: ${e3.message}`);

    // Record mapping (upsert via unique constraint)
    const { error: e4 } = await supabase
      .from("product_merge_map")
      .upsert(
        {
          user_id: userId,
          canonical_product_id: data.canonicalProductId,
          merged_product_id: data.mergedProductId,
        },
        { onConflict: "user_id,merged_product_id" },
      );
    if (e4) throw new Error(`Errore registrazione merge: ${e4.message}`);

    return { ok: true };
  });

/**
 * Reverse a previous merge: clear `merged_into` and remove the mapping row.
 * Existing purchases stay on the canonical product (we don't try to guess
 * which historical purchases should move back).
 */
export const unmergeProductsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ mergedProductId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error: e1 } = await supabase
      .from("products")
      .update({ merged_into: null })
      .eq("id", data.mergedProductId)
      .eq("user_id", userId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabase
      .from("product_merge_map")
      .delete()
      .eq("merged_product_id", data.mergedProductId)
      .eq("user_id", userId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const dismissDedupPairFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ productIdA: z.string().uuid(), productIdB: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Normalize ordering so (a,b) and (b,a) hit the same uniqueness slot
    const [a, b] = [data.productIdA, data.productIdB].sort();
    const { error } = await supabase
      .from("product_dedup_dismissed")
      .upsert(
        { user_id: userId, product_id_a: a, product_id_b: b },
        { onConflict: "user_id,product_id_a,product_id_b" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeDismissedPairFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("product_dedup_dismissed")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });