import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Plus, GitMerge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { categoryMeta } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type Row = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  purchases: { price: number; purchase_date: string; store_name: string | null }[];
};

type SortKey = "name" | "recent" | "price-asc" | "price-desc";

function ProductsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [store, setStore] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");

  const { data, isLoading } = useQuery({
    queryKey: ["products-with-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, brand, category, image_url, merged_into, purchases(price, purchase_date, store_name)",
        )
        .limit(500);
      if (error) {
        // Fallback if the merged_into column doesn't exist yet (migration not applied)
        const { data: d2, error: e2 } = await supabase
          .from("products")
          .select(
            "id, name, brand, category, image_url, purchases(price, purchase_date, store_name)",
          )
          .limit(500);
        if (e2) throw e2;
        return (d2 ?? []) as unknown as Row[];
      }
      return ((data ?? []) as any[]).filter((p) => !p.merged_into) as Row[];
    },
  });

  const categories = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((p) => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [data]);

  const stores = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((p) =>
      p.purchases?.forEach((pu) => pu.store_name && s.add(pu.store_name)),
    );
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = (data ?? [])
      .filter((p) => {
        if (cat !== "all" && p.category !== cat) return false;
        if (
          store !== "all" &&
          !p.purchases?.some((pu) => pu.store_name === store)
        )
          return false;
        if (t) {
          const hay = `${p.name} ${p.brand ?? ""}`.toLowerCase();
          if (!hay.includes(t)) return false;
        }
        return true;
      })
      .map((p) => {
        const sorted = [...(p.purchases ?? [])].sort(
          (a, b) =>
            new Date(b.purchase_date).getTime() -
            new Date(a.purchase_date).getTime(),
        );
        const last = sorted[0];
        return { ...p, lastPrice: last ? Number(last.price) : null, lastDate: last?.purchase_date ?? null };
      });

    switch (sort) {
      case "name":
        rows.sort((a, b) => a.name.localeCompare(b.name, "it"));
        break;
      case "recent":
        rows.sort(
          (a, b) =>
            new Date(b.lastDate ?? 0).getTime() -
            new Date(a.lastDate ?? 0).getTime(),
        );
        break;
      case "price-asc":
        rows.sort((a, b) => (a.lastPrice ?? Infinity) - (b.lastPrice ?? Infinity));
        break;
      case "price-desc":
        rows.sort((a, b) => (b.lastPrice ?? -Infinity) - (a.lastPrice ?? -Infinity));
        break;
    }
    return rows;
  }, [data, q, cat, store, sort]);

  if (location.pathname !== "/products") return <Outlet />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o brand..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="icon" onClick={() => navigate({ to: "/products/new" })} aria-label="Aggiungi prodotto">
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={() => navigate({ to: "/products/duplicates" })}
          aria-label="Gestisci e unisci duplicati"
          title="Gestisci e unisci duplicati"
        >
          <GitMerge className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={store} onValueChange={setStore}>
          <SelectTrigger><SelectValue placeholder="Negozio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i negozi</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nome A-Z</SelectItem>
            <SelectItem value="recent">Ultimo acquisto</SelectItem>
            <SelectItem value="price-asc">Prezzo crescente</SelectItem>
            <SelectItem value="price-desc">Prezzo decrescente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {data?.length === 0 ? "Nessun prodotto. Aggiungine uno!" : "Nessun risultato."}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const meta = categoryMeta(p.category);
            const Icon = meta.icon;
            return (
              <Link key={p.id} to="/products/$id" params={{ id: p.id }}>
                <Card className="p-3 flex items-center gap-3 hover:border-primary/40 transition-colors">
                  <div className={`h-12 w-12 rounded-lg overflow-hidden grid place-items-center shrink-0 ${meta.className}`}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[p.brand, p.category].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {p.lastPrice !== null && (
                    <div className="text-right shrink-0">
                      <div className="font-semibold">€{p.lastPrice.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground">ultimo</div>
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}