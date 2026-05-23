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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/user-errors";

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

function ReceiptDetailPage() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["receipt-group", groupId],
    queryFn: async () => {
      const [{ data: purchases, error: e1 }, { data: imgs, error: e2 }] =
        await Promise.all([
          supabase
            .from("purchases")
            .select(
              "id, product_id, store_name, price, quantity, unit, purchase_date, notes, products(name)",
            )
            .eq("receipt_group_id", groupId)
            .order("created_at", { ascending: true }),
          supabase
            .from("receipt_images")
            .select("id, storage_path, position")
            .eq("receipt_group_id", groupId)
            .order("position", { ascending: true }),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;

      // Sign storage paths so the images render.
      const signed: { url: string; path: string }[] = [];
      for (const img of imgs ?? []) {
        const { data: s } = await supabase.storage
          .from("receipts")
          .createSignedUrl(img.storage_path, 3600);
        if (s?.signedUrl) signed.push({ url: s.signedUrl, path: img.storage_path });
      }
      return {
        purchases: ((purchases ?? []) as unknown as PurchaseRow[]).map((p) => ({
          ...p,
          price: Number(p.price),
        })),
        images: signed,
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
      store: first?.store_name ?? "—",
      date: first?.purchase_date ?? "",
    };
  }, [data]);

  const deleteAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("purchases")
        .delete()
        .eq("receipt_group_id", groupId);
      if (error) throw error;
      // Best-effort cleanup of images.
      const paths = data?.images.map((i) => i.path) ?? [];
      if (paths.length) {
        await supabase.storage.from("receipts").remove(paths);
      }
      await supabase.from("receipt_images").delete().eq("receipt_group_id", groupId);
    },
    onSuccess: () => {
      toast.success("Scontrino eliminato");
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      navigate({ to: "/scan" });
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
    <div className="space-y-4 pb-8">
      <Link
        to="/scan"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Scansioni
      </Link>

      {/* Header */}
      <Card className="p-4">
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
            <Pencil className="h-4 w-4 mr-1" /> Modifica
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

      {/* Images gallery */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
          Immagini scontrino
        </h3>
        {data.images.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <ImageOff className="h-6 w-6 mx-auto mb-2 opacity-60" />
            📄 Nessuna immagine disponibile
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

      {/* Products list */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
          Prodotti ({data.purchases.length})
        </h3>
        <div className="space-y-2">
          {data.purchases.map((p) => (
            <Link
              key={p.id}
              to="/products/$id"
              params={{ id: p.product_id }}
            >
              <Card className="p-3 hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {p.products?.name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.quantity ?? 1} {p.unit ?? "pz"} × €{Number(p.price).toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">
                      €{(Number(p.price) * (p.quantity ?? 1)).toFixed(2)}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Fullscreen image zoom */}
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
        groupId={groupId}
        currentStore={header.store === "—" ? "" : header.store}
        currentDate={header.date}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["receipt-group", groupId] });
          qc.invalidateQueries({ queryKey: ["recent-scans"] });
        }}
      />
    </div>
  );
}

function EditHeaderDialog({
  open,
  onOpenChange,
  groupId,
  currentStore,
  currentDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groupId: string;
  currentStore: string;
  currentDate: string;
  onSaved: () => void;
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from("purchases")
        .update({
          store_name: store.trim() || null,
          purchase_date: date,
        })
        .eq("receipt_group_id", groupId);
      if (error) throw error;
      toast.success("Scontrino aggiornato");
      onSaved();
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