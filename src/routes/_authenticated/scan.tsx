import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { scanReceipt } from "@/lib/openai.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
});

type Item = {
  name: string;
  quantity: number;
  unit: string | null;
  price: number;
  selected: boolean;
  match?: { id: string; name: string } | null;
};

function ScanPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [store, setStore] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([]);

  const scan = useServerFn(scanReceipt);
  const qc = useQueryClient();

  const recent = useQuery({
    queryKey: ["recent-scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("store_name, purchase_date")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const groups = new Map<string, { store: string | null; date: string; count: number }>();
      (data ?? []).forEach((r: any) => {
        const key = `${r.purchase_date}|${r.store_name ?? ""}`;
        const g = groups.get(key) ?? { store: r.store_name, date: r.purchase_date, count: 0 };
        g.count += 1;
        groups.set(key, g);
      });
      return Array.from(groups.values()).slice(0, 5);
    },
  });

  const handleFile = (file: File) => {
    setError(null);
    setItems([]);
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      setPreview(dataUrl);
      setBase64(dataUrl.split(",")[1] ?? "");
    };
    r.readAsDataURL(file);
  };

  const reset = () => {
    setPreview(null);
    setBase64(null);
    setItems([]);
    setError(null);
  };

  const analyze = async () => {
    if (!base64) return;
    setAnalyzing(true);
    setError(null);
    setItems([]);
    try {
      const result = await scan({ data: { imageBase64: base64 } });
      setStore(result.store_name ?? "");
      if (result.purchase_date) setDate(result.purchase_date);
      const parsed: Item[] = (result.items ?? []).map((it) => ({
        ...it,
        selected: true,
      }));
      // Match against existing products
      await Promise.all(
        parsed.map(async (item) => {
          if (!item.name) return;
          const { data } = await supabase
            .from("products")
            .select("id, name")
            .ilike("name", `%${item.name.slice(0, 20)}%`)
            .limit(1);
          if (data && data[0]) item.match = { id: data[0].id, name: data[0].name };
        }),
      );
      setItems(parsed);
      if (parsed.length === 0) {
        setError("Nessun prodotto riconosciuto. Riprova con un'immagine più nitida.");
      } else {
        toast.success(`Trovati ${parsed.length} prodotti`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Errore durante l'analisi dello scontrino");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = async () => {
    const selected = items.filter((it) => it.selected && it.name.trim());
    if (selected.length === 0) {
      toast.error("Nessun prodotto selezionato");
      return;
    }
    setSaving(true);
    try {
      for (const item of selected) {
        let productId = item.match?.id;
        if (!productId) {
          const { data: created, error: pErr } = await supabase
            .from("products")
            .insert({ name: item.name.trim() })
            .select("id")
            .single();
          if (pErr) throw pErr;
          productId = created.id;
        }
        const { error: puErr } = await supabase.from("purchases").insert({
          product_id: productId,
          store_name: store.trim() || null,
          price: item.price,
          quantity: item.quantity || 1,
          unit: item.unit,
          purchase_date: date,
        });
        if (puErr) throw puErr;
      }
      toast.success(`${selected.length} ${selected.length === 1 ? "acquisto salvato" : "acquisti salvati"}`);
      reset();
      setStore("");
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {/* Input mode */}
      {!preview && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-32 flex-col gap-2"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-8 w-8" />
            <span>Scatta foto</span>
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-32 flex-col gap-2"
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon className="h-8 w-8" />
            <span>Carica immagine</span>
          </Button>
        </div>
      )}

      {/* Preview + analyze */}
      {preview && (
        <Card className="p-3 space-y-3">
          <div className="relative">
            <img src={preview} alt="scontrino" className="w-full max-h-80 object-contain rounded-md bg-muted" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={reset}
              disabled={analyzing}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Rifai
            </Button>
            {items.length === 0 && (
              <Button className="flex-1" onClick={analyze} disabled={analyzing}>
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizzo...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" /> Analizza scontrino
                  </>
                )}
              </Button>
            )}
          </div>

          {analyzing && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Sto analizzando lo scontrino...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-destructive font-medium">{error}</div>
                <Button size="sm" variant="ghost" className="mt-1 h-7" onClick={analyze}>
                  Riprova
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Results */}
      {items.length > 0 && (
        <>
          <Card className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Negozio</Label>
                <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Es. Esselunga" />
              </div>
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {items.map((it, i) => (
              <Card key={i} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={it.selected}
                    onCheckedChange={(c) => updateItem(i, { selected: !!c })}
                    className="mt-2"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Input
                      value={it.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      placeholder="Nome prodotto"
                    />
                    {it.match && (
                      <div className="flex items-center gap-1 text-xs text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" />
                        Corrispondenza: <span className="font-medium">{it.match.name}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Quantità</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={it.quantity}
                          onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Prezzo unitario €</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={it.price}
                          onChange={(e) => updateItem(i, { price: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salva selezionati ({items.filter((i) => i.selected).length})
          </Button>
        </>
      )}

      {/* History */}
      <div className="pt-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
          Ultime scansioni
        </h3>
        {recent.isLoading ? (
          <p className="text-xs text-muted-foreground px-1">Caricamento...</p>
        ) : (recent.data ?? []).length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            Nessuna scansione effettuata.
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.data!.map((s, i) => (
              <Card key={i} className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.store ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.date).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {s.count} {s.count === 1 ? "prodotto" : "prodotti"}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Avoid unused-import warning on useEffect (kept for future enhancements).
void useEffect;