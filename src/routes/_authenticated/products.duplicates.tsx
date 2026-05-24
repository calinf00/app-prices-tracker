import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  GitMerge,
  Undo2,
  RotateCcw,
  Loader2,
  Sparkles,
  Check,
  X,
  EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  mergeProductsFn,
  unmergeProductsFn,
  removeDismissedPairFn,
  dismissDedupPairFn,
} from "@/lib/merge-products.functions";
import { toUserMessage } from "@/lib/user-errors";
import {
  findCatalogDuplicatesFn,
  type CatalogDuplicatePair,
} from "@/lib/product-similarity.functions";

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

type ProductLite = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  merged_into: string | null;
  last_price: number | null;
  last_date: string | null;
};

function DuplicatesPage() {
  const qc = useQueryClient();
  const merge = useServerFn(mergeProductsFn);
  const unmerge = useServerFn(unmergeProductsFn);
  const removeDismissed = useServerFn(removeDismissedPairFn);
  const dismissPair = useServerFn(dismissDedupPairFn);
  const findDuplicates = useServerFn(findCatalogDuplicatesFn);
  const [pending, setPending] = useState<string | null>(null);
  const [canonicalId, setCanonicalId] = useState<string>("");
  const [duplicateId, setDuplicateId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPairs, setAiPairs] = useState<CatalogDuplicatePair[]>([]);
  const [aiRan, setAiRan] = useState(false);

  // Full product catalog (active only) for the manual merge selectors + AI scan.
  const products = useQuery({
    queryKey: ["dedup-products-catalog"],
    queryFn: async (): Promise<ProductLite[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, brand, category, merged_into, purchases(price, purchase_date)",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((p) => !p.merged_into)
        .map((p) => {
          const sorted = [...(p.purchases ?? [])].sort((a: any, b: any) =>
            (b.purchase_date ?? "").localeCompare(a.purchase_date ?? ""),
          );
          const last = sorted[0];
          return {
            id: p.id,
            name: p.name,
            brand: p.brand ?? null,
            category: p.category ?? null,
            merged_into: p.merged_into ?? null,
            last_price: last ? Number(last.price) : null,
            last_date: last?.purchase_date ?? null,
          };
        });
    },
  });

  const productMap = useMemo(() => {
    const m = new Map<string, ProductLite>();
    (products.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [products.data]);

  const canonical: ProductLite | null =
    (canonicalId ? productMap.get(canonicalId) : null) ?? null;
  const duplicate: ProductLite | null =
    (duplicateId ? productMap.get(duplicateId) : null) ?? null;

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

  const dismissedKeys = useMemo(() => {
    const s = new Set<string>();
    (dismissed.data ?? []).forEach((d) =>
      s.add([d.product_id_a, d.product_id_b].sort().join("|")),
    );
    return s;
  }, [dismissed.data]);

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
      toast.error(toUserMessage(e));
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
      toast.error(toUserMessage(e));
    } finally {
      setPending(null);
    }
  };

  const handleManualMerge = async () => {
    if (!canonicalId || !duplicateId) return;
    if (canonicalId === duplicateId) {
      toast.error("Seleziona due prodotti diversi");
      return;
    }
    setMerging(true);
    try {
      await merge({
        data: {
          canonicalProductId: canonicalId,
          mergedProductId: duplicateId,
        },
      });
      toast.success("Prodotti uniti correttamente");
      setCanonicalId("");
      setDuplicateId("");
      qc.invalidateQueries({ queryKey: ["product-merges"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      qc.invalidateQueries({ queryKey: ["dedup-products-catalog"] });
    } catch (e: any) {
      const msg = e?.message ?? "Errore";
      // Fallback if the schema column doesn't exist yet
      if (/merged_into/i.test(msg) || /product_merge_map/i.test(msg)) {
        toast.message(
          "Merge parziale: il prodotto duplicato può essere eliminato manualmente dalla lista prodotti",
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setMerging(false);
    }
  };

  const runAiScan = async () => {
    if (!products.data || products.data.length < 2) {
      toast.error("Servono almeno 2 prodotti per l'analisi");
      return;
    }
    setAiLoading(true);
    setAiRan(false);
    try {
      const payload = products.data.slice(0, 400).map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand ?? undefined,
      }));
      const { pairs } = await findDuplicates({ data: { products: payload } });
      // Filter out dismissed pairs
      const filtered = pairs.filter(
        (p) => !dismissedKeys.has([p.idA, p.idB].sort().join("|")),
      );
      setAiPairs(filtered);
      setAiRan(true);
      if (filtered.length === 0) {
        toast.success("Nessun duplicato sospetto trovato");
      } else {
        toast.success(`Trovate ${filtered.length} possibili coppie duplicate`);
      }
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore durante l'analisi AI"));
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAiPair = (p: CatalogDuplicatePair) => {
    setCanonicalId(p.idA);
    setDuplicateId(p.idB);
    setAiPairs((arr) => arr.filter((x) => !(x.idA === p.idA && x.idB === p.idB)));
    toast.message("Coppia pre-compilata: rivedi e conferma il merge sopra");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const rejectAiPair = (p: CatalogDuplicatePair) => {
    setAiPairs((arr) => arr.filter((x) => !(x.idA === p.idA && x.idB === p.idB)));
  };

  const dismissAiPair = async (p: CatalogDuplicatePair) => {
    try {
      await dismissPair({
        data: { productIdA: p.idA, productIdB: p.idB },
      });
      qc.invalidateQueries({ queryKey: ["product-dismissed-pairs"] });
      toast.success("Coppia ignorata in futuro");
    } catch (e: any) {
      // Fallback to localStorage if the table doesn't exist
      try {
        const KEY = "dedup-dismissed-fallback-v1";
        const raw = localStorage.getItem(KEY);
        const list: string[] = raw ? JSON.parse(raw) : [];
        list.push([p.idA, p.idB].sort().join("|"));
        localStorage.setItem(KEY, JSON.stringify(list));
        toast.success("Coppia ignorata (salvata localmente)");
      } catch {
        toast.error(toUserMessage(e));
      }
    } finally {
      setAiPairs((arr) =>
        arr.filter((x) => !(x.idA === p.idA && x.idB === p.idB)),
      );
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

      {/* A) Manual merge */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Unisci prodotti manualmente</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">
              Prodotto principale (verrà mantenuto)
            </label>
            <Select value={canonicalId} onValueChange={setCanonicalId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona prodotto principale" />
              </SelectTrigger>
              <SelectContent>
                {(products.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.brand ? ` — ${p.brand}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Prodotto da unire (duplicato)
            </label>
            <Select value={duplicateId} onValueChange={setDuplicateId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona duplicato" />
              </SelectTrigger>
              <SelectContent>
                {(products.data ?? [])
                  .filter((p) => p.id !== canonicalId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.brand ? ` — ${p.brand}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(canonical || duplicate) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <PreviewBlock label="Principale" p={canonical} />
            <PreviewBlock label="Duplicato" p={duplicate} />
          </div>
        )}

        <Button
          onClick={handleManualMerge}
          disabled={!canonicalId || !duplicateId || merging}
          className="w-full"
        >
          {merging ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <GitMerge className="h-4 w-4 mr-1.5" />
          )}
          Unisci prodotti
        </Button>
      </Card>

      {/* B) AI suggestions */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Suggerimenti AI — Possibili duplicati
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={runAiScan}
            disabled={aiLoading || (products.data?.length ?? 0) < 2}
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            Analizza con AI
          </Button>
        </div>

        {aiLoading && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Analisi in corso...
          </p>
        )}

        {!aiLoading && aiRan && aiPairs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Nessun duplicato rilevato.
          </p>
        )}

        {aiPairs.map((p) => {
          const a = productMap.get(p.idA);
          const b = productMap.get(p.idB);
          return (
            <Card key={`${p.idA}-${p.idB}`} className="p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="shrink-0">
                  {Math.round(p.score * 100)}% simile
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <PreviewBlock label="A" p={a ?? null} fallbackName={p.nameA} />
                <PreviewBlock label="B" p={b ?? null} fallbackName={p.nameB} />
              </div>
              {p.reason && (
                <p className="text-xs italic text-muted-foreground">
                  {p.reason}
                </p>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                <Button size="sm" onClick={() => acceptAiPair(p)}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Sì, uniamo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rejectAiPair(p)}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> No, diversi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissAiPair(p)}
                >
                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Non chiedere più
                </Button>
              </div>
            </Card>
          );
        })}
      </Card>

      {/* C) Merge history */}
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

      {/* D) Dismissed pairs (collapsible) */}
      <Accordion type="single" collapsible>
        <AccordionItem value="dismissed" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold">
            Coppie ignorate ({dismissed.data?.length ?? 0})
          </AccordionTrigger>
          <AccordionContent>
            {dismissed.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            ) : (dismissed.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                Nessuna coppia ignorata.
              </p>
            ) : (
              <div className="space-y-2">
                {dismissed.data!.map((d) => (
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
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function PreviewBlock({
  label,
  p,
  fallbackName,
}: {
  label: string;
  p: ProductLite | null;
  fallbackName?: string;
}) {
  return (
    <div className="rounded-md border p-2 space-y-0.5 bg-background">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-medium truncate">{p?.name ?? fallbackName ?? "—"}</div>
      {p?.brand && <div className="text-muted-foreground truncate">{p.brand}</div>}
      {p?.category && <div className="text-muted-foreground">{p.category}</div>}
      {p?.last_price != null && (
        <div className="text-muted-foreground">
          Ultimo: €{p.last_price.toFixed(2)}
          {p.last_date ? ` · ${p.last_date}` : ""}
        </div>
      )}
    </div>
  );
}