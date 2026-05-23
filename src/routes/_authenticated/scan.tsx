import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { scanReceipt } from "@/lib/openai.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
});

type Item = { name: string; quantity: number; unit: string | null; price: number };

function ScanPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [store, setStore] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([]);
  const scan = useServerFn(scanReceipt);

  const handleFile = async (file: File) => {
    setLoading(true);
    setItems([]);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      setPreview(dataUrl);
      const base64 = dataUrl.split(",")[1] ?? "";
      const result = await scan({ data: { imageBase64: base64 } });
      setStore(result.store_name ?? "");
      if (result.purchase_date) setDate(result.purchase_date);
      setItems(result.items ?? []);
      if ((result.items ?? []).length === 0) {
        toast.warning("Nessun prodotto riconosciuto. Aggiungili manualmente.");
      } else {
        toast.success(`Trovati ${result.items.length} prodotti`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Errore analisi scontrino");
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (i: number, patch: Partial<Item>) => {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const removeItem = (i: number) => {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    if (items.length === 0) return;
    setSaving(true);
    try {
      for (const item of items) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .ilike("name", item.name)
          .limit(1)
          .maybeSingle();

        let productId = existing?.id;
        if (!productId) {
          const { data: created, error: pErr } = await supabase
            .from("products")
            .insert({ name: item.name })
            .select("id")
            .single();
          if (pErr) throw pErr;
          productId = created.id;
        }

        const { error: puErr } = await supabase.from("purchases").insert({
          product_id: productId,
          store_name: store || null,
          price: item.price,
          quantity: item.quantity || 1,
          unit: item.unit,
          purchase_date: date,
        });
        if (puErr) throw puErr;
      }
      toast.success("Acquisti salvati");
      setItems([]);
      setPreview(null);
      setStore("");
    } catch (e: any) {
      toast.error(e?.message ?? "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col items-center gap-3">
        {preview ? (
          <img src={preview} alt="scontrino" className="max-h-48 rounded-md" />
        ) : (
          <div className="h-32 w-full rounded-md border border-dashed border-border grid place-items-center text-muted-foreground">
            <Camera className="h-8 w-8" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisi in corso...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4 mr-2" /> Scatta o carica scontrino
            </>
          )}
        </Button>
      </Card>

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
                <div className="flex gap-2">
                  <Input
                    value={it.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    placeholder="Nome prodotto"
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeItem(i)}
                    aria-label="Rimuovi"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={it.price}
                    onChange={(e) => updateItem(i, { price: Number(e.target.value) })}
                    placeholder="Prezzo"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    value={it.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                    placeholder="Qtà"
                  />
                  <Input
                    value={it.unit ?? ""}
                    onChange={(e) => updateItem(i, { unit: e.target.value || null })}
                    placeholder="Unità"
                  />
                </div>
              </Card>
            ))}
          </div>

          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salva {items.length} {items.length === 1 ? "acquisto" : "acquisti"}
          </Button>
        </>
      )}
    </div>
  );
}