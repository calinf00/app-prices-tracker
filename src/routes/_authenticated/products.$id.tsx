import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { categoryMeta, CATEGORIES, STORE_COLORS, UNITS } from "@/lib/categories";
import { calcUnitPrices } from "@/lib/unit-conversion";
import { UnitPriceFields } from "./products.new";

export const Route = createFileRoute("/_authenticated/products/$id")({
  component: ProductDetailPage,
});

type Purchase = {
  id: string;
  store_name: string | null;
  price: number;
  quantity: number | null;
  unit: string | null;
  purchase_date: string;
  notes: string | null;
  price_per_base_unit?: number | null;
  base_unit?: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
};

function ProductDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [adding, setAdding] = useState(false);
  const [editProductOpen, setEditProductOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const productPromise = supabase
        .from("products")
        .select("id, name, brand, category, image_url")
        .eq("id", id)
        .single();
      let purchasesRes: any = await supabase
        .from("purchases")
        .select("id, store_name, price, quantity, unit, purchase_date, notes, price_per_base_unit, base_unit")
        .eq("product_id", id)
        .order("purchase_date", { ascending: true });
      if (purchasesRes.error && /column|schema cache/i.test(purchasesRes.error.message ?? "")) {
        purchasesRes = await supabase
          .from("purchases")
          .select("id, store_name, price, quantity, unit, purchase_date, notes")
          .eq("product_id", id)
          .order("purchase_date", { ascending: true });
      }
      const { data: product, error: e1 } = await productPromise;
      const { data: purchases, error: e2 } = purchasesRes;
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        product: product as ProductRow,
        purchases: ((purchases ?? []) as Purchase[]).map((x) => ({
          ...x,
          price: Number(x.price),
        })),
      };
    },
  });

  const deletePurchase = useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      toast.success("Acquisto eliminato");
    },
    onError: (e: any) => toast.error(toUserMessage(e, "Errore")),
  });

  const deleteProduct = useMutation({
    mutationFn: async () => {
      // Delete purchases first to avoid FK constraint issues.
      const { error: e1 } = await supabase
        .from("purchases")
        .delete()
        .eq("product_id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("products").delete().eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      toast.success("Prodotto eliminato");
      navigate({ to: "/products" });
    },
    onError: (e: any) => toast.error(toUserMessage(e, "Errore eliminazione")),
  });

  const stats = useMemo(() => {
    const list = data?.purchases ?? [];
    if (list.length === 0) return null;
    let minP = list[0];
    let maxP = list[0];
    let sum = 0;
    for (const p of list) {
      if (p.price < minP.price) minP = p;
      if (p.price > maxP.price) maxP = p;
      sum += p.price;
    }
    const last = [...list].sort(
      (a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime(),
    )[0];
    return { min: minP, max: maxP, avg: sum / list.length, last };
  }, [data]);

  const { chartData, stores } = useMemo(() => {
    const list = data?.purchases ?? [];
    const storeSet = new Set<string>();
    list.forEach((p) => storeSet.add(p.store_name ?? "Sconosciuto"));
    const stores = Array.from(storeSet);
    const byDate = new Map<string, Record<string, number | string>>();
    list.forEach((p) => {
      const key = p.purchase_date;
      const row = byDate.get(key) ?? { date: key };
      row[p.store_name ?? "Sconosciuto"] = p.price;
      byDate.set(key, row);
    });
    const chartData = Array.from(byDate.values())
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
      .map((r) => ({
        ...r,
        date: new Date(r.date as string).toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
        }),
      }));
    return { chartData, stores };
  }, [data]);

  const storeComparison = useMemo(() => {
    const map = new Map<string, Purchase>();
    (data?.purchases ?? []).forEach((p) => {
      const k = p.store_name ?? "Sconosciuto";
      const prev = map.get(k);
      if (!prev || new Date(p.purchase_date) > new Date(prev.purchase_date)) {
        map.set(k, p);
      }
    });
    const list = data?.purchases ?? [];
    const avg = list.length
      ? list.reduce((s, p) => s + p.price, 0) / list.length
      : 0;
    return Array.from(map.entries())
      .map(([store, p]) => ({
        store,
        ...p,
        variance: avg ? ((p.price - avg) / avg) * 100 : 0,
      }))
      .sort((a, b) => a.price - b.price);
  }, [data]);

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Caricamento...</p>;
  if (!data?.product)
    return <p className="text-sm text-muted-foreground">Prodotto non trovato.</p>;

  const p = data.product;
  const meta = categoryMeta(p.category);
  const Icon = meta.icon;

  return (
    <div className="space-y-4 pb-8">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tutti i prodotti
      </Link>

      <Card className="p-4 flex gap-4 items-center">
        <div className={`h-16 w-16 rounded-lg overflow-hidden grid place-items-center shrink-0 ${meta.className}`}>
          {p.image_url ? (
            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-7 w-7" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold truncate">{p.name}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {[p.brand, p.category].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditProductOpen(true)}
        >
          <Pencil className="h-4 w-4 mr-1" /> Modifica
        </Button>
      </Card>

      {chartData.length > 0 && (
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2 px-1">Andamento prezzi per negozio</div>
          <div className="h-56">
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
                  formatter={(v: any) => `€${Number(v).toFixed(2)}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {stores.map((s, i) => (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    stroke={STORE_COLORS[i % STORE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Min storico"
            value={`€${stats.min.price.toFixed(2)}`}
            sub={`${stats.min.store_name ?? "—"} · ${fmtDate(stats.min.purchase_date)}`}
          />
          <StatCard
            label="Max storico"
            value={`€${stats.max.price.toFixed(2)}`}
            sub={`${stats.max.store_name ?? "—"} · ${fmtDate(stats.max.purchase_date)}`}
          />
          <StatCard label="Medio" value={`€${stats.avg.toFixed(2)}`} sub="su tutti gli acquisti" />
          <StatCard
            label="Ultimo"
            value={`€${stats.last.price.toFixed(2)}`}
            sub={`${stats.last.store_name ?? "—"} · ${fmtDate(stats.last.purchase_date)}`}
          />
          <StatCard
            label="Acquisti totali"
            value={`${data.purchases.length}`}
            sub={data.purchases.length === 1 ? "registrato" : "registrati"}
          />
        </div>
      )}

      {storeComparison.length > 0 && (
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-2 px-1">Confronto negozi</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negozio</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Prezzo</TableHead>
                <TableHead className="text-right">vs media</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storeComparison.map((s, i) => (
                <TableRow key={s.store}>
                  <TableCell className="font-medium">
                    {i === 0 && <span className="text-emerald-500 mr-1">●</span>}
                    {s.store}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(s.purchase_date)}</TableCell>
                  <TableCell className="text-right font-semibold">€{s.price.toFixed(2)}</TableCell>
                  <TableCell
                    className={`text-right text-xs ${
                      s.variance < 0 ? "text-emerald-600" : s.variance > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {s.variance === 0
                      ? "—"
                      : `${s.variance > 0 ? "+" : ""}${s.variance.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex items-center justify-between px-1 pt-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Storico acquisti</h3>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Aggiungi
        </Button>
      </div>

      {data.purchases.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nessun acquisto. Aggiungi il primo!
        </Card>
      ) : (
        <div className="space-y-2">
          {[...data.purchases].reverse().map((x) => (
            <Card key={x.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{x.store_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(x.purchase_date)}
                    {x.quantity ? ` · x${x.quantity} ${x.unit ?? ""}` : ""}
                  </div>
                  {x.notes && (
                    <div className="text-xs text-muted-foreground italic mt-1 truncate">{x.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col items-end">
                    <div className="font-semibold">€{x.price.toFixed(2)}</div>
                    {(() => {
                      const ppbu =
                        x.price_per_base_unit ??
                        (x.quantity && x.quantity > 0
                          ? calcUnitPrices(x.price, x.quantity, x.unit ?? "pz").pricePerBaseUnit
                          : null);
                      const bu =
                        x.base_unit ??
                        (x.unit ? calcUnitPrices(x.price, x.quantity ?? 1, x.unit).baseUnitLabel.replace("€/", "") : null);
                      if (!ppbu || !bu) return null;
                      return (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          €{ppbu.toFixed(2)}/{bu}
                        </span>
                      );
                    })()}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(x)} aria-label="Modifica">
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Eliminare questo acquisto?")) deletePurchase.mutate(x.id);
                    }}
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PurchaseDialog
        open={adding || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setAdding(false);
            setEditing(null);
          }
        }}
        productId={id}
        purchase={editing}
        onSaved={() => {
          setAdding(false);
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["product", id] });
          qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
        }}
      />

      <ProductEditDialog
        open={editProductOpen}
        onOpenChange={setEditProductOpen}
        product={p}
        onSaved={() => {
          setEditProductOpen(false);
          qc.invalidateQueries({ queryKey: ["product", id] });
          qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
        }}
      />

      <div className="pt-6">
        <Button
          variant="outline"
          className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Elimina prodotto
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminare il prodotto?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Eliminando questo prodotto verranno eliminati anche tutti i{" "}
            <b>{data.purchases.length}</b> acquisti associati. Continuare?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Annulla
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDelete(false);
                deleteProduct.mutate();
              }}
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </Card>
  );
}

function PurchaseDialog({
  open,
  onOpenChange,
  productId,
  purchase,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productId: string;
  purchase: Purchase | null;
  onSaved: () => void;
}) {
  const isEdit = !!purchase;
  const [store, setStore] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [multiPack, setMultiPack] = useState(false);
  const [itemsPerPack, setItemsPerPack] = useState<string>("");
  const [volumePerItem, setVolumePerItem] = useState<string>("");

  // Sync when dialog opens
  useEffect(() => {
    if (open) {
      setStore(purchase?.store_name ?? "");
      setPrice(purchase ? String(purchase.price) : "");
      setQuantity(purchase?.quantity ? String(purchase.quantity) : "1");
      setUnit(purchase?.unit ?? "pz");
      setDate(purchase?.purchase_date ?? new Date().toISOString().slice(0, 10));
      setNotes(purchase?.notes ?? "");
      setMultiPack(false);
      setItemsPerPack("");
      setVolumePerItem("");
    }
  }, [open, purchase]);

  const save = async () => {
    if (!price) {
      toast.error("Inserisci il prezzo");
      return;
    }
    setSaving(true);
    try {
      const qty = Number(quantity) || 1;
      const ipp = multiPack ? Math.max(1, Number(itemsPerPack) || 1) : 1;
      const vpi = multiPack ? Number(volumePerItem) || 0 : 0;
      const calc = calcUnitPrices(Number(price), qty, unit, ipp, vpi);
      const payload = {
        product_id: productId,
        store_name: store.trim() || null,
        price: Number(price),
        quantity: qty,
        unit,
        purchase_date: date,
        notes: notes.trim() || null,
      };
      const withUnitPrice = {
        ...payload,
        price_per_base_unit: Number(calc.pricePerBaseUnit.toFixed(4)),
        base_unit: calc.baseUnitLabel.replace("€/", ""),
      };
      const exec = async (body: any) =>
        isEdit && purchase
          ? supabase.from("purchases").update(body).eq("id", purchase.id)
          : supabase.from("purchases").insert(body);
      let { error } = await exec(withUnitPrice);
      if (error && /column|schema cache/i.test(error.message ?? "")) {
        const retry = await exec(payload);
        error = retry.error;
        if (!error) {
          toast.warning(
            "Colonne prezzo unitario non ancora disponibili — applica la migration Supabase",
          );
        }
      }
      if (error) throw error;
      toast.success(isEdit ? "Acquisto aggiornato" : "Acquisto aggiunto");
      onSaved();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica acquisto" : "Nuovo acquisto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Negozio</Label>
            <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Es. Esselunga" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Prezzo</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Quantità</Label>
              <Input type="number" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Unità</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <UnitPriceFields
            price={price}
            quantity={quantity}
            unit={unit}
            multiPack={multiPack}
            setMultiPack={setMultiPack}
            itemsPerPack={itemsPerPack}
            setItemsPerPack={setItemsPerPack}
            volumePerItem={volumePerItem}
            setVolumePerItem={setVolumePerItem}
          />
          <div>
            <Label className="text-xs">Note</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving}>{isEdit ? "Salva" : "Aggiungi"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductEditDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: ProductRow;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [category, setCategory] = useState<string>(product.category ?? "Altro");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(product.name);
      setBrand(product.brand ?? "");
      setCategory(product.category ?? "Altro");
    }
  }, [open, product]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Inserisci il nome");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          brand: brand.trim() || null,
          category,
        })
        .eq("id", product.id);
      if (error) throw error;
      toast.success("Prodotto aggiornato");
      onSaved();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore salvataggio"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica prodotto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-1.5" /> Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}