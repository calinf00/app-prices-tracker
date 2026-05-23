import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, Package, ShoppingCart, Bot, TrendingDown, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

type PurchaseRow = {
  id: string;
  store_name: string | null;
  price: number;
  quantity: number;
  unit: string | null;
  purchase_date: string;
  product_id: string | null;
  products: { name: string } | null;
};

function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["home-summary"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const isoMonth = startOfMonth.toISOString().slice(0, 10);

      const [recent, month] = await Promise.all([
        supabase
          .from("purchases")
          .select("id, store_name, price, quantity, unit, purchase_date, product_id, products(name)")
          .order("purchase_date", { ascending: false })
          .limit(5),
        supabase
          .from("purchases")
          .select("price, quantity")
          .gte("purchase_date", isoMonth),
      ]);
      const total = (month.data ?? []).reduce(
        (sum: number, r: any) => sum + Number(r.price) * Number(r.quantity ?? 1),
        0,
      );
      return {
        recent: (recent.data ?? []) as unknown as PurchaseRow[],
        monthTotal: total,
        monthCount: month.data?.length ?? 0,
      };
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="h-4 w-4" /> Spesa mese
          </div>
          <div className="mt-2 text-2xl font-bold">
            €{(data?.monthTotal ?? 0).toFixed(2)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Receipt className="h-4 w-4" /> Acquisti
          </div>
          <div className="mt-2 text-2xl font-bold">{data?.monthCount ?? 0}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Shortcut to="/scan" icon={Camera} label="Scansiona scontrino" />
        <Shortcut to="/products" icon={Package} label="Vedi prodotti" />
        <Shortcut to="/shopping-list" icon={ShoppingCart} label="Lista spesa" />
        <Shortcut to="/assistant" icon={Bot} label="Chiedi all'AI" />
      </div>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 px-1">Ultimi acquisti</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground px-1">Caricamento...</p>
        ) : data?.recent.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nessun acquisto registrato. Scansiona il primo scontrino!
          </Card>
        ) : (
          <div className="space-y-2">
            {data?.recent.map((p) => (
              <Card key={p.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.products?.name ?? "Prodotto"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.store_name ?? "—"} · {new Date(p.purchase_date).toLocaleDateString("it-IT")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">€{Number(p.price).toFixed(2)}</div>
                  {p.quantity ? (
                    <div className="text-xs text-muted-foreground">
                      x{p.quantity} {p.unit ?? ""}
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Shortcut({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Camera;
  label: string;
}) {
  return (
    <Link
      to={to as "/"}
      className="rounded-xl border border-border bg-card p-4 flex flex-col items-start gap-2 hover:border-primary/50 hover:bg-accent/30 transition-colors"
    >
      <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary grid place-items-center">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}