import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ImageOff,
  Receipt as ReceiptIcon,
} from "lucide-react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/user-errors";
import { decodeReceiptKey, encodeReceiptKey } from "@/lib/receipt-key";
import { UNITS } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/scan/$groupId")({
  component: ReceiptDetailPage,
});

type PurchaseRow = {
  id: string;
  product_id: string;
  store_name: string | null;
  price: number;
  quantity: number | null;
  unit: string | null;
  purchase_date: string;
  notes: string | null;
  products: { name: string } | null;
};

type ReceiptKey = { store: string | null; date: string };

function applyReceiptFilter(query: any, key: ReceiptKey) {
  const filtered = query.eq("purchase_date", key.date);
  return key.store ? filtered.eq("store_name", key.store) : filtered.is("store_name", null);
}

function ReceiptDetailPage() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const receiptKey = useMemo(() => decodeReceiptKey(groupId), [groupId]);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["receipt-group", groupId],
    queryFn: async () => {
      if (!receiptKey.date) return { purchases: [] as PurchaseRow[], images: [] as { url: string; path: string }[] };

      const { data: purchases, error } = await applyReceiptFilter(
        supabase
          .from("purchases")
          .select("id, product_id, store_name, price, quantity, unit, purchase_date, notes, products(name)")
          .order("created_at", { ascending: true }),
        receiptKey,
      );
      if (error) throw error;

      return {
        purchases: ((purchases ?? []) as unknown as PurchaseRow[]).map((p) => ({
          ...p,
          price: Number(p.price),
        })),
        images: [] as { url: string; path: string }[],
      };
    },
  });

  const total = useMemo(
    () =>
      (data?.purchases ?? []).reduce(
        (s, p) => s + Number(p.price) * (p.quantity ?? 1),
        0,
      ),
    [data],
  );

  const header = useMemo(() => {
    const first = data?.purchases?.[0];
    return {
      store: first?.store_name ?? receiptKey.store ?? "—",
      date: first?.purchase_date ?? receiptKey.date,
    };
  }, [data, receiptKey]);

  const deleteAll = useMutation({
    mutationFn: async () => {
      const { error } = await applyReceiptFilter(
        supabase.from("purchases").delete(),
        receiptKey,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scontrino eliminato");
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      navigate({ to: "/scan" });
    },
    onError: (e: any) => toast.error(toUserMessage(e, "Errore eliminazione")),
  });

  const deletePurchase = useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Riga eliminata");
      qc.invalidateQueries({ queryKey: ["receipt-group", groupId] });
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
    },
    onError: (e: any) => toast.error(toUserMessage(e, "Errore eliminazione")),
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Caricamento...</p>;
  if (!data || data.purchases.length === 0)
    return (
      <div className="space-y-3">
        <Link
          to="/scan"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Scansioni
        </Link>
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Scontrino non trovato.
        </Card>
      </div>
    );

  return (
    <div className="space-y-6 pb-8">
      <Link
        to="/scan"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Scansioni
      </Link>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold truncate">{header.store}</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {header.date
                ? new Date(header.date).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Totale</div>
            <div className="text-2xl font-bold">€{total.toFixed(2)}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setEditingOpen(true)}
          >
            <Pencil className="h-4 w-4 mr-1" /> Modifica scontrino
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => {
              if (confirm("Eliminare l'intero scontrino e tutti gli acquisti?"))
                deleteAll.mutate();
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Elimina
          </Button>
        </div>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
          Immagini scontrino
        </h3>
        {data.images.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <ImageOff className="h-6 w-6 mx-auto mb-2 opacity-60" />
            Nessuna immagine disponibile
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {data.images.map((img, i) => (
              <button
                key={img.path}
                type="button"
                onClick={() => setZoomUrl(img.url)}
                className="relative rounded-md overflow-hidden border bg-muted aspect-square"
              >
                <img
                  src={img.url}
                  alt={`Pagina ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
          Prodotti ({data.purchases.length})
        </h3>
        <div className="space-y-2">
          {data.purchases.map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/products/$id"
                  params={{ id: p.product_id }}
                  className="min-w-0 flex-1"
                >
                  <div className="font-medium truncate">
                    {p.products?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.quantity ?? 1} {p.unit ?? "pz"} × €{Number(p.price).toFixed(2)}
                  </div>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="font-semibold px-1">
                    €{(Number(p.price) * (p.quantity ?? 1)).toFixed(2)}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingPurchase(p)}
                    aria-label="Modifica riga"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Eliminare questo prodotto dallo scontrino?")) deletePurchase.mutate(p.id);
                    }}
                    aria-label="Elimina riga"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={!!zoomUrl} onOpenChange={(o) => !o && setZoomUrl(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoomUrl && (
            <div className="overflow-auto max-h-[80vh] touch-pinch-zoom">
              <img
                src={zoomUrl}
                alt="scontrino"
                className="w-full h-auto rounded"
                style={{ touchAction: "pinch-zoom" }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditHeaderDialog
        open={editingOpen}
        onOpenChange={setEditingOpen}
        receiptKey={receiptKey}
        currentStore={header.store === "—" ? "" : header.store}
        currentDate={header.date}
        onSaved={(next) => {
          qc.invalidateQueries({ queryKey: ["recent-scans"] });
          qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
          navigate({ to: "/scan/$groupId", params: { groupId: encodeReceiptKey(next.store, next.date) } });
        }}
      />

      <PurchaseEditDialog
        purchase={editingPurchase}
        onOpenChange={(open) => !open && setEditingPurchase(null)}
        onSaved={(productId) => {
          setEditingPurchase(null);
          qc.invalidateQueries({ queryKey: ["receipt-group", groupId] });
          qc.invalidateQueries({ queryKey: ["product", productId] });
          qc.invalidateQueries({ queryKey: ["recent-scans"] });
          qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
        }}
      />
    </div>
  );
}

function EditHeaderDialog({
  open,
  onOpenChange,
  receiptKey,
  currentStore,
  currentDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receiptKey: ReceiptKey;
  currentStore: string;
  currentDate: string;
  onSaved: (next: ReceiptKey) => void;
}) {
  const [store, setStore] = useState(currentStore);
  const [date, setDate] = useState(currentDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStore(currentStore);
      setDate(currentDate);
    }
  }, [open, currentStore, currentDate]);

  const save = async () => {
    if (!date) {
      toast.error("Inserisci la data");
      return;
    }
    setSaving(true);
    try {
      const next = { store: store.trim() || null, date };
      const { error } = await applyReceiptFilter(
        supabase.from("purchases").update({
          store_name: next.store,
          purchase_date: next.date,
        }),
        receiptKey,
      );
      if (error) throw error;
      toast.success("Scontrino aggiornato");
      onSaved(next);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore aggiornamento"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica scontrino</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Negozio</Label>
            <Input value={store} onChange={(e) => setStore(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={save} disabled={saving}>
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseEditDialog({
  purchase,
  onOpenChange,
  onSaved,
}: {
  purchase: PurchaseRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (productId: string) => void;
}) {
  const [name, setName] = useState("");
  const [store, setStore] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (purchase) {
      setName(purchase.products?.name ?? "");
      setStore(purchase.store_name ?? "");
      setPrice(String(purchase.price));
      setQuantity(String(purchase.quantity ?? 1));
      setUnit(purchase.unit ?? "pz");
      setDate(purchase.purchase_date);
      setNotes(purchase.notes ?? "");
    }
  }, [purchase]);

  const save = async () => {
    if (!purchase) return;
    if (!name.trim() || !price || !date) {
      toast.error("Compila nome, prezzo e data");
      return;
    }
    setSaving(true);
    try {
      const { error: productError } = await supabase
        .from("products")
        .update({ name: name.trim() })
        .eq("id", purchase.product_id);
      if (productError) throw productError;

      const { error: purchaseError } = await supabase
        .from("purchases")
        .update({
          store_name: store.trim() || null,
          price: Number(price),
          quantity: Number(quantity) || 1,
          unit,
          purchase_date: date,
          notes: notes.trim() || null,
        })
        .eq("id", purchase.id);
      if (purchaseError) throw purchaseError;

      toast.success("Prodotto dello scontrino aggiornato");
      onSaved(purchase.product_id);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore salvataggio"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!purchase} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica prodotto scontrino</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome prodotto</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Negozio</Label>
            <Input value={store} onChange={(e) => setStore(e.target.value)} />
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={save} disabled={saving}>
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
