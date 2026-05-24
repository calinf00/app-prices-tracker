import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search,
  Package,
  Receipt,
  Store,
  Repeat,
  TrendingUp,
  TrendingDown,
  Plus,
  Camera,
  PencilLine,
  ShoppingBasket,
  Apple,
  Beef,
  Milk,
  Cookie,
  Sparkles,
  Tag,
  Bot,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

type PurchaseRow = {
  id: string;
  store_name: string | null;
  price: number;
  quantity: number | null;
  unit: string | null;
  purchase_date: string;
  product_id: string | null;
  products: { name: string; category: string | null } | null;
};

const categoryIcons: Record<string, typeof Package> = {
  frutta: Apple,
  verdura: Apple,
  carne: Beef,
  pesce: Beef,
  latticini: Milk,
  bevande: Milk,
  snack: Cookie,
  dolci: Cookie,
  pulizia: Sparkles,
  igiene: Sparkles,
};

function iconForCategory(cat?: string | null) {
  if (!cat) return ShoppingBasket;
  const k = cat.toLowerCase();
  for (const key of Object.keys(categoryIcons)) {
    if (k.includes(key)) return categoryIcons[key];
  }
  return ShoppingBasket;
}

function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "";

  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const { data } = useQuery({
    queryKey: ["home-data"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const isoMonth = startOfMonth.toISOString().slice(0, 10);

      const [allP, monthP, prodCount] = await Promise.all([
        supabase
          .from("purchases")
          .select(
            "id, store_name, price, quantity, unit, purchase_date, product_id, products(name, category)",
          )
          .order("purchase_date", { ascending: false })
          .limit(500),
        supabase
          .from("purchases")
          .select("id", { count: "exact", head: true })
          .gte("purchase_date", isoMonth),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);

      const all = (allP.data ?? []) as unknown as PurchaseRow[];

      // most visited store
      const storeFreq = new Map<string, number>();
      const productFreq = new Map<string, number>();
      for (const p of all) {
        if (p.store_name) storeFreq.set(p.store_name, (storeFreq.get(p.store_name) ?? 0) + 1);
        const n = p.products?.name;
        if (n) productFreq.set(n, (productFreq.get(n) ?? 0) + 1);
      }
      const topStore = [...storeFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      const topProduct = [...productFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

      // price alerts: compare last two prices per product
      type Alert = {
        productId: string;
        name: string;
        oldPrice: number;
        newPrice: number;
        deltaPct: number;
      };
      const byProduct = new Map<string, PurchaseRow[]>();
      for (const p of all) {
        if (!p.product_id) continue;
        const arr = byProduct.get(p.product_id) ?? [];
        arr.push(p);
        byProduct.set(p.product_id, arr);
      }
      const alerts: Alert[] = [];
      for (const [pid, list] of byProduct) {
        if (list.length < 2) continue;
        const [latest, prev] = list;
        const oldPrice = Number(prev.price);
        const newPrice = Number(latest.price);
        if (!oldPrice || oldPrice === newPrice) continue;
        const deltaPct = ((newPrice - oldPrice) / oldPrice) * 100;
        alerts.push({
          productId: pid,
          name: latest.products?.name ?? "Prodotto",
          oldPrice,
          newPrice,
          deltaPct,
        });
      }
      alerts.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

      return {
        all,
        recent: all.slice(0, 8),
        monthCount: monthP.count ?? 0,
        productsCount: prodCount.count ?? 0,
        topStore,
        topProduct,
        alerts: alerts.slice(0, 6),
      };
    },
  });

  const searchResults = useMemo(() => {
    if (!q.trim() || !data) return [];
    const needle = q.toLowerCase();
    const seen = new Map<string, PurchaseRow>();
    for (const p of data.all) {
      const name = p.products?.name ?? "";
      if (!name.toLowerCase().includes(needle)) continue;
      if (!seen.has(name)) seen.set(name, p);
      if (seen.size >= 10) break;
    }
    return [...seen.values()];
  }, [q, data]);

  return (
    <div className="space-y-10 md:space-y-12 relative pb-8">
      {/* Greeting */}
      <section className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">
          Ciao {firstName}
        </h2>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
      </section>

      {/* AI Assistant quick access */}
      <Link to="/assistant">
        <Card className="p-4 flex items-center gap-4 border-primary/20 hover:border-primary/40 transition-colors bg-primary/5">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm">Assistente AI</div>
            <div className="text-xs text-muted-foreground mt-0.5">Chiedi consigli sulla spesa, analizza i prezzi</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Card>
      </Link>

      {/* Search */}
      <section className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca un prodotto..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        {q.trim() && (
          <Card className="p-2 divide-y divide-border">
            {searchResults.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">Nessun risultato</div>
            ) : (
              searchResults.map((p) => (
                <Link
                  key={p.id}
                  to="/products/$id"
                  params={{ id: p.product_id ?? "" }}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-accent/40 rounded-md"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.products?.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.store_name ?? "—"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">€{Number(p.price).toFixed(2)}</div>
                </Link>
              ))
            )}
          </Card>
        )}
      </section>

      {/* Stats - horizontal scroll */}
      <section>
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-4 min-w-max pb-2">
            <StatCard icon={Package} label="Prodotti tracciati" value={String(data?.productsCount ?? 0)} />
            <StatCard icon={Receipt} label="Acquisti questo mese" value={String(data?.monthCount ?? 0)} />
            <StatCard icon={Store} label="Negozio top" value={data?.topStore ?? "—"} />
            <StatCard icon={Repeat} label="Più frequente" value={data?.topProduct ?? "—"} />
          </div>
        </div>
      </section>

      {/* Recent purchases */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 px-1">Ultimi acquisti</h3>
        {!data ? (
          <p className="text-sm text-muted-foreground px-1">Caricamento...</p>
        ) : data.recent.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nessun acquisto registrato.
          </Card>
        ) : (
          <div className="space-y-3">
            {data.recent.map((p) => {
              const Icon = iconForCategory(p.products?.category);
              const inner = (
                <Card className="p-4 pr-5 flex items-center gap-4 hover:border-primary/40 transition-colors">
                  <div className="h-11 w-11 shrink-0 rounded-lg bg-primary/15 text-primary grid place-items-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate leading-tight">{p.products?.name ?? "Prodotto"}</div>
                    <div className="text-xs text-muted-foreground truncate mt-1">
                      {p.store_name ?? "—"} ·{" "}
                      {new Date(p.purchase_date).toLocaleDateString("it-IT")}
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <div className="font-semibold tabular-nums leading-tight">€{Number(p.price).toFixed(2)}</div>
                    {p.quantity ? (
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        x{p.quantity} {p.unit ?? ""}
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
              return p.product_id ? (
                <Link key={p.id} to="/products/$id" params={{ id: p.product_id }}>
                  {inner}
                </Link>
              ) : (
                <div key={p.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </section>

      {/* Price alerts */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 px-1 flex items-center gap-2">
          <Tag className="h-4 w-4" /> Avvisi prezzi
        </h3>
        {!data || data.alerts.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            Nessuna variazione di prezzo rilevata.
          </Card>
        ) : (
          <div className="space-y-3">
            {data.alerts.map((a) => {
              const up = a.deltaPct > 0;
              return (
                <Link
                  key={a.productId}
                  to="/products/$id"
                  params={{ id: a.productId }}
                >
                  <Card className="p-4 pr-5 flex items-center gap-4 hover:border-primary/40 transition-colors">
                    <div
                      className={`h-11 w-11 shrink-0 rounded-lg grid place-items-center ${
                        up
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      {up ? (
                        <TrendingUp className="h-5 w-5" />
                      ) : (
                        <TrendingDown className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate leading-tight">{a.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        €{a.oldPrice.toFixed(2)} → €{a.newPrice.toFixed(2)}
                      </div>
                    </div>
                    <div
                      className={`text-sm font-semibold shrink-0 pl-2 tabular-nums ${
                        up ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {up ? "+" : ""}
                      {a.deltaPct.toFixed(1)}%
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Floating action button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg z-40"
            aria-label="Aggiungi"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuItem onClick={() => navigate({ to: "/products" })}>
            <PencilLine className="h-4 w-4 mr-2" /> Aggiungi acquisto manuale
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: "/scan" })}>
            <Camera className="h-4 w-4 mr-2" /> Scansiona scontrino
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4 min-h-[88px] min-w-[170px] max-w-[210px] flex flex-col justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-3 text-xl font-bold truncate">{value}</div>
    </Card>
  );
}