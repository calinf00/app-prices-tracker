import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, GitMerge, Undo2, RotateCcw, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  unmergeProductsFn,
  removeDismissedPairFn,
} from "@/lib/merge-products.functions";

export const Route = createFileRoute("/_authenticated/products/duplicates")({
  component: DuplicatesPage,
});

type MergeRow = {
  id: string;
  canonical_product_id: string;
  merged_product_id: string;
  created_at: string;
  canonical?: { name: string } | null;
  merged?: { name: string } | null;
};

type DismissedRow = {
  id: string;
  product_id_a: string;
  product_id_b: string;
  created_at: string;
  product_a?: { name: string } | null;
  product_b?: { name: string } | null;
};

function DuplicatesPage() {
  const qc = useQueryClient();
  const unmerge = useServerFn(unmergeProductsFn);
  const removeDismissed = useServerFn(removeDismissedPairFn);
  const [pending, setPending] = useState<string | null>(null);

  const merges = useQuery({
    queryKey: ["product-merges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_merge_map")
        .select(
          "id, canonical_product_id, merged_product_id, created_at, canonical:products!product_merge_map_canonical_product_id_fkey(name), merged:products!product_merge_map_merged_product_id_fkey(name)",
        )
        .order("created_at", { ascending: false });
      if (error) {
        // FK aliases may not exist; fall back to plain rows + manual lookup
        const { data: rows } = await supabase
          .from("product_merge_map")
          .select("id, canonical_product_id, merged_product_id, created_at")
          .order("created_at", { ascending: false });
        return (rows ?? []) as MergeRow[];
      }
      return (data ?? []) as unknown as MergeRow[];
    },
  });

  const dismissed = useQuery({
    queryKey: ["product-dismissed-pairs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_dedup_dismissed")
        .select("id, product_id_a, product_id_b, created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as DismissedRow[];
    },
  });

  // Fallback: load product names if FK alias didn't return embedded data
  const allIds = new Set<string>();
  merges.data?.forEach((m) => {
    allIds.add(m.canonical_product_id);
    allIds.add(m.merged_product_id);
  });
  dismissed.data?.forEach((d) => {
    allIds.add(d.product_id_a);
    allIds.add(d.product_id_b);
  });

  const names = useQuery({
    queryKey: ["dedup-product-names", Array.from(allIds).sort().join(",")],
    enabled: allIds.size > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .in("id", Array.from(allIds));
      const map = new Map<string, string>();
      (data ?? []).forEach((p: any) => map.set(p.id, p.name));
      return map;
    },
  });
  const nameOf = (id: string) => names.data?.get(id) ?? id.slice(0, 8);

  const handleUnmerge = async (m: MergeRow) => {
    setPending(m.id);
    try {
      await unmerge({ data: { mergedProductId: m.merged_product_id } });
      toast.success("Merge annullato");
      qc.invalidateQueries({ queryKey: ["product-merges"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setPending(null);
    }
  };

  const handleRemoveDismissed = async (d: DismissedRow) => {
    setPending(d.id);
    try {
      await removeDismissed({ data: { id: d.id } });
      toast.success("Rimosso dal blocklist");
      qc.invalidateQueries({ queryKey: ["product-dismissed-pairs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/products">
          <Button variant="ghost" size="icon" aria-label="Indietro">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitMerge className="h-5 w-5" /> Gestisci duplicati
        </h2>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Merge confermati ({merges.data?.length ?? 0})
        </h3>
        {merges.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : (merges.data?.length ?? 0) === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground text-center">
            Nessun merge confermato.
          </Card>
        ) : (
          merges.data!.map((m) => (
            <Card key={m.id} className="p-3 space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Unito: </span>
                <span className="font-medium">
                  {m.merged?.name ?? nameOf(m.merged_product_id)}
                </span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium">
                  {m.canonical?.name ?? nameOf(m.canonical_product_id)}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUnmerge(m)}
                disabled={pending === m.id}
                className="w-full"
              >
                {pending === m.id ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4 mr-1.5" />
                )}
                Annulla merge
              </Button>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Coppie ignorate ({dismissed.data?.length ?? 0})
        </h3>
        {dismissed.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : (dismissed.data?.length ?? 0) === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground text-center">
            Nessuna coppia ignorata.
          </Card>
        ) : (
          dismissed.data!.map((d) => (
            <Card key={d.id} className="p-3 space-y-2">
              <div className="text-sm">
                <span className="font-medium">{nameOf(d.product_id_a)}</span>
                <span className="text-muted-foreground"> ↔ </span>
                <span className="font-medium">{nameOf(d.product_id_b)}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRemoveDismissed(d)}
                disabled={pending === d.id}
                className="w-full"
              >
                {pending === d.id ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                )}
                Rimuovi dal blocklist
              </Button>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}