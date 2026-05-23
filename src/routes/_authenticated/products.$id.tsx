import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/products/$id")({
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const [{ data: product }, { data: purchases }] = await Promise.all([
        supabase.from("products").select("*").eq("id", id).single(),
        supabase
          .from("purchases")
          .select("id, store_name, price, quantity, unit, purchase_date")
          .eq("product_id", id)
          .order("purchase_date", { ascending: true }),
      ]);
      return { product, purchases: purchases ?? [] };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Caricamento...</p>;
  if (!data?.product) return <p className="text-sm text-muted-foreground">Prodotto non trovato.</p>;

  const p: any = data.product;
  const chartData = data.purchases.map((x: any) => ({
    date: new Date(x.purchase_date).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
    price: Number(x.price),
    store: x.store_name,
  }));

  const prices = data.purchases.map((x: any) => Number(x.price));
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

  return (
    <div className="space-y-4">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tutti i prodotti
      </Link>

      <Card className="p-4 flex gap-4 items-center">
        <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden grid place-items-center shrink-0">
          {p.image_url ? (
            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{p.name}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {[p.brand, p.category].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </Card>

      {prices.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Min" value={`€${min!.toFixed(2)}`} />
          <Stat label="Medio" value={`€${avg!.toFixed(2)}`} />
          <Stat label="Max" value={`€${max!.toFixed(2)}`} />
        </div>
      )}

      {chartData.length > 1 && (
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2 px-1">Andamento prezzo</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="price" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">Storico acquisti</h3>
        {data.purchases.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nessun acquisto per questo prodotto.
          </Card>
        ) : (
          <div className="space-y-2">
            {[...data.purchases].reverse().map((x: any) => (
              <Card key={x.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{x.store_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(x.purchase_date).toLocaleDateString("it-IT")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">€{Number(x.price).toFixed(2)}</div>
                  {x.quantity ? (
                    <div className="text-xs text-muted-foreground">
                      x{x.quantity} {x.unit ?? ""}
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold mt-1">{value}</div>
    </Card>
  );
}