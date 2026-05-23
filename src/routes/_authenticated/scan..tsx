import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ImageOff,
  Receipt as ReceiptIcon,
  Plus,
  Check,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { CATEGORIES, UNITS } from "@/lib/categories";
import { decodeReceiptKey, isUuid } from "@/lib/receipt-key";

export const Route = createFileRoute("/_authenticated/scan/")({
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
  receipt_image_url: string | null;
  products: { id: string; name: string } | null;
};

function ReceiptDetailPage() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerStore, setHeaderStore] = useState("");
  const [headerDate, setHeaderDate] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);

  const { store: keyStore, date: keyDate } = useMemo(
    () => decodeReceiptKey(groupId),
    [groupId],
  );
  const legacyUuid = isUuid(groupId);

  const queryKey = ["receipt-group", groupId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select(
          "id, product_id, store_name, price, quantity, unit, purchase_date, notes, receipt_image_url, products(id, name)",
        );

      if (legacyUuid) {
        // Legacy: fall back to receipt_group_id if the column exists.
        // @ts-ignore - column may or may not exist
        query = query.eq("receipt_group_id", groupId);
      } else {
        query = query.eq("purchase_date", keyDate);
        if (keyStore === null || keyStore === "") {
          query = query.is("store_name", null);
        } else {
          query = query.eq("store_name", keyStore);
        }
      }

      const { data: purchases, error } = await query.order("id", {
        ascending: true,
      });
      if (error) throw error;

      const rows = ((purchases ?? []) as unknown as PurchaseRow[]).map((p) => ({
        ...p,
        price: Number(p.price),
      }));

      // Collect distinct receipt_image_url paths from the group's purchases.
      const paths = Array.from(
        new Set(rows.map((r) => r.receipt_image_url).filter(Boolean) as string[]),
      );
      const signed: { url: string; path: string }[] = [];
      for (const path of paths) {
        // If it's already a URL, use as-is.
        if (path.startsWith("http")) {
          signed.push({ url: path, path });
        } else {
          const { data: s } = await supabase.storage
            .from("receipts")
            .createSignedUrl(path, 3600);
          if (s?.signedUrl) signed.push({ url: s.signedUrl, path });
        }
      }

      return { purchases: rows, images: signed };
    },
  });

  const purchases = data?.purchases ?? [];
  const total = useMemo(
    () => purchases.reduce((s, p) => s + p.price * (p.quantity ?? 1), 0),
    [purchases],
  );

  const headerInfo = useMemo(() => {
    const first = purchases[0];
    return {
      store: first?.store_name ?? keyStore ?? "—",
      date: first?.purchase_date ?? keyDate ?? "",
      receiptImage: purchases.find((p) => p.receipt_image_url)?.receipt_image_url ?? null,
    };
  }, [purchases, keyStore, keyDate]);

  useEffect(() => {
    if (editingHeader) {
      setHeaderStore(headerInfo.store === "—" ? "" : (headerInfo.store as string));
      setHeaderDate(headerInfo.date);
    }
  }, [editingHeader, headerInfo.store, headerInfo.date]);

  const saveHeader = async () => {
    if (purchases.length === 0) return;
    setSavingHeader(true);
    try {
      const ids = purchases.map((p) => p.id);
      const { error } = await supabase
        .from("purchases")
        .update({
          store_name: headerStore.trim() || null,
          purchase_date: headerDate,
        })
        .in("id", ids);
      if (error) throw error;
      toast.success("Scontrino aggiornato");
      setEditingHeader(false);
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      // Group key changed → navigate to the new key.
      const { encodeReceiptKey } = await import("@/lib/receipt-key");
      const newKey = encodeReceiptKey(headerStore.trim() || null, headerDate);
      navigate({ to: "/scan/$groupId", params: { groupId: newKey }, replace: true });
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore aggiornamento"));
    } finally {
      setSavingHeader(false);
    }
  };

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      toast.success("Acquisto eliminato");
    },
    onError: (e: any) => toast.error(toUserMessage(e, "Errore eliminazione")),
  });

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Caricamento...</p>;

  if (!data || purchases.length === 0)
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
    <div className="space-y-4 pb-8">
      <Link
        to="/scan"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Scansioni
      </Link>

      {/* Header */}
      <Card className="p-4">
        {editingHeader ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Negozio</Label>
              <Input
                value={headerStore}
                onChange={(e) => setHeaderStore(e.target.value)}
                placeholder="Es. Esselunga"
              />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={headerDate}
                onChange={(e) => setHeaderDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setEditingHeader(false)}
              >
                <X className="h-4 w-4 mr-1" /> Annulla
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={saveHeader}
                disabled={savingHeader}
              >
                <Check className="h-4 w-4 mr-1" /> Salva
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              className="text-left min-w-0 flex-1 group"
              onClick={() => setEditingHeader(true)}
            >
              <div className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-semibold truncate group-hover:underline">
                  {headerInfo.store}
                </h2>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {headerInfo.date
                  ? new Date(headerInfo.date).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </button>
            <div className="text-right shrink-0">
              <div className="text-xs text-muted-foreground">Totale</div>
              <div className="text-2xl font-bold">€{total.toFixed(2)}</div>
            </div>
          </div>
        )}
      </Card>

      {/* Receipt images */}
      {data.images.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
            Immagine scontrino
          </h3>
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
        </div>
      ) : (
        <Card className="p-4 text-center text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5 mx-auto mb-1 opacity-60" />
          Nessuna immagine disponibile
        </Card>
      )}

      {/* Products list */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Prodotti ({purchases.length})
          </h3>
          <Button size="sm" variant="outline" onClick={() => setAddingProduct(true)}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi
          </Button>
        </div>
        <div className="space-y-2">
          {purchases.map((p) =>
            editingPurchaseId === p.id ? (
              <PurchaseEditCard
                key={p.id}
                purchase={p}
                onCancel={() => setEditingPurchaseId(null)}
                onSaved={() => {
                  setEditingPurchaseId(null);
                  qc.invalidateQueries({ queryKey });
                  qc.invalidateQueries({ queryKey: ["recent-scans"] });
                  qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
                }}
              />
            ) : (
              <Card key={p.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {p.products?.name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.quantity ?? 1} {p.unit ?? "pz"} × €{p.price.toFixed(2)}
                    </div>
                    {p.notes && (
                      <div className="text-[11px] text-muted-foreground italic mt-1 truncate">
                        {p.notes}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-1">
                    <div className="font-semibold mr-2">
                      €{(p.price * (p.quantity ?? 1)).toFixed(2)}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingPurchaseId(p.id)}
                      aria-label="Modifica"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Eliminare "${p.products?.name ?? "questo prodotto"}"?`))
                          deletePurchase.mutate(p.id);
                      }}
                      aria-label="Elimina"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      </div>

      <AddProductDialog
        open={addingProduct}
        onOpenChange={setAddingProduct}
        storeName={headerInfo.store === "—" ? null : (headerInfo.store as string)}
        purchaseDate={headerInfo.date}
        onSaved={() => {
          setAddingProduct(false);
          qc.invalidateQueries({ queryKey });
          qc.invalidateQueries({ queryKey: ["recent-scans"] });
          qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
        }}
      />

      {/* Zoom image */}
      <Dialog open={!!zoomUrl} onOpenChange={(o) => !o && setZoomUrl(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoomUrl && (
            <div className="overflow-auto max-h-[80vh]">
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
    </div>
  );
}

function PurchaseEditCard({
  purchase,
  onCancel,
  onSaved,
}: {
  purchase: PurchaseRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(purchase.products?.name ?? "");
  const [price, setPrice] = useState(String(purchase.price));
  const [quantity, setQuantity] = useState(String(purchase.quantity ?? 1));
  const [unit, setUnit] = useState(purchase.unit ?? "pz");
  const [store, setStore] = useState(purchase.store_name ?? "");
  const [date, setDate] = useState(purchase.purchase_date);
  const [notes, setNotes] = useState(purchase.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!price) {
      toast.error("Inserisci il prezzo");
      return;
    }
    setSaving(true);
    try {
      const { error: e1 } = await supabase
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
      if (e1) throw e1;

      if (name.trim() && name.trim() !== (purchase.products?.name ?? "")) {
        const { error: e2 } = await supabase
          .from("products")
          .update({ name: name.trim() })
          .eq("id", purchase.product_id);
        if (e2) throw e2;
      }
      toast.success("Acquisto aggiornato ✅");
      onSaved();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore salvataggio"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-3 border-primary/40 space-y-2">
      <div>
        <Label className="text-xs">Nome prodotto</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Prezzo</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Quantità</Label>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Unità</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Negozio</Label>
        <Input value={store} onChange={(e) => setStore(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Note</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button size="sm" className="flex-1" onClick={save} disabled={saving}>
          💾 Salva modifiche
        </Button>
      </div>
    </Card>
  );
}

function AddProductDialog({
  open,
  onOpenChange,
  storeName,
  purchaseDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeName: string | null;
  purchaseDate: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [category, setCategory] = useState<string>("Altro");
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setPrice("");
      setQuantity("1");
      setUnit("pz");
      setCategory("Altro");
    }
  }, [open]);

  const suggestions = useQuery({
    queryKey: ["product-suggest", name],
    enabled: open && name.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, category")
        .ilike("name", `%${name.trim()}%`)
        .limit(6);
      return data ?? [];
    },
  });

  const save = async () => {
    if (!name.trim()) {
      toast.error("Inserisci il nome del prodotto");
      return;
    }
    if (!price) {
      toast.error("Inserisci il prezzo");
      return;
    }
    setSaving(true);
    try {
      // Find or create product
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .ilike("name", name.trim())
        .limit(1);
      let productId = existing?.[0]?.id as string | undefined;
      if (!productId) {
        const { data: created, error: pErr } = await supabase
          .from("products")
          .insert({ name: name.trim(), category })
          .select("id")
          .single();
        if (pErr) throw pErr;
        productId = created.id;
      }

      const { error } = await supabase.from("purchases").insert({
        product_id: productId,
        store_name: storeName,
        price: Number(price),
        quantity: Number(quantity) || 1,
        unit,
        purchase_date: purchaseDate,
        notes: "Aggiunto manualmente",
      });
      if (error) throw error;
      toast.success("Prodotto aggiunto ✅");
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
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Aggiungi prodotto allo scontrino</h3>
          <div className="relative">
            <Label className="text-xs">Nome prodotto</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              placeholder="Es. Latte intero 1L"
            />
            {suggestOpen && (suggestions.data?.length ?? 0) > 0 && (
              <Card className="absolute z-20 left-0 right-0 mt-1 p-1 max-h-48 overflow-auto">
                {suggestions.data!.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setName(s.name);
                      if (s.category) setCategory(s.category);
                      setSuggestOpen(false);
                    }}
                    className="block w-full text-left px-2 py-2 text-sm rounded hover:bg-muted"
                  >
                    {s.name}
                    {s.category && (
                      <span className="text-xs text-muted-foreground ml-2">
                        · {s.category}
                      </span>
                    )}
                  </button>
                ))}
              </Card>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Prezzo</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Quantità</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Unità</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button className="flex-1" onClick={save} disabled={saving}>
              Aggiungi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
