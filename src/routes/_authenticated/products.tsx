import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
};

function ProductsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, category, image_url")
        .order("name", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const filtered = (data ?? []).filter((p) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (
      p.name.toLowerCase().includes(t) ||
      (p.brand?.toLowerCase().includes(t) ?? false) ||
      (p.category?.toLowerCase().includes(t) ?? false)
    );
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca prodotti..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {data?.length === 0 ? "Nessun prodotto. Scansiona uno scontrino!" : "Nessun risultato."}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Link key={p.id} to="/products/$id" params={{ id: p.id }}>
              <Card className="p-3 flex items-center gap-3 hover:border-primary/40 transition-colors">
                <div className="h-12 w-12 rounded-md bg-muted overflow-hidden grid place-items-center shrink-0">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.brand, p.category].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}