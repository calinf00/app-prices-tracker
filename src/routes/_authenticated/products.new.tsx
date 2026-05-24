import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, UNITS } from "@/lib/categories";
import { Switch } from "@/components/ui/switch";
import { calcUnitPrices } from "@/lib/unit-conversion";

export const Route = createFileRoute("/_authenticated/products/new")({
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<string>("Altro");
  const [barcode, setBarcode] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const [store, setStore] = useState("");
  const [price, setPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [unit, setUnit] = useState<string>("pz");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [multiPack, setMultiPack] = useState(false);
  const [itemsPerPack, setItemsPerPack] = useState<string>("");
  const [volumePerItem, setVolumePerItem] = useState<string>("");

  const handleFile = (file: File) => {
    const r = new FileReader();
    r.onload = () => setImageDataUrl(r.result as string);
    r.readAsDataURL(file);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Inserisci il nome del prodotto");
      return;
    }
    setSaving(true);
    try {
      const { data: product, error: pErr } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          brand: brand.trim() || null,
          category,
          barcode: barcode.trim() || null,
          image_url: imageDataUrl,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      if (price) {
        const qty = Number(quantity) || 1;
        const ipp = multiPack ? Math.max(1, Number(itemsPerPack) || 1) : 1;
        const vpi = multiPack ? Number(volumePerItem) || 0 : 0;
        const calc = calcUnitPrices(Number(price), qty, unit, ipp, vpi);
        const base = {
          product_id: product.id,
          store_name: store.trim() || null,
          price: Number(price),
          quantity: qty,
          unit,
          purchase_date: date,
          notes: notes.trim() || null,
        };
        const withUnitPrice = {
          ...base,
          price_per_base_unit: Number(calc.pricePerBaseUnit.toFixed(4)),
          base_unit: calc.baseUnitLabel.replace("€/", ""),
        };
        let { error: puErr } = await supabase.from("purchases").insert(withUnitPrice);
        if (puErr && /column|schema cache/i.test(puErr.message ?? "")) {
          const retry = await supabase.from("purchases").insert(base);
          puErr = retry.error;
          if (!puErr) {
            toast.warning(
              "Colonne prezzo unitario non ancora disponibili — applica la migration Supabase",
            );
          }
        }
        if (puErr) throw puErr;
      }

      toast.success("Prodotto creato");
      navigate({ to: "/products/$id", params: { id: product.id } });
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore salvataggio"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Annulla
      </Link>

      <h1 className="text-xl font-semibold">Nuovo prodotto</h1>

      <Card className="p-3 space-y-3">
        <div>
          <Label className="text-xs">Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Latte intero" />
        </div>
        <div>
          <Label className="text-xs">Brand / Marca</Label>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Es. Granarolo" />
        </div>
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Barcode</Label>
          <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Opzionale" />
        </div>
        <div>
          <Label className="text-xs">Foto prodotto</Label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-md bg-muted overflow-hidden grid place-items-center shrink-0">
              {imageDataUrl ? (
                <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" type="button" onClick={() => fileRef.current?.click()}>
              {imageDataUrl ? "Cambia" : "Scegli"}
            </Button>
          </div>
        </div>
      </Card>

      <h2 className="text-sm font-semibold text-muted-foreground px-1">Primo acquisto (opzionale)</h2>
      <Card className="p-3 space-y-3">
        <div>
          <Label className="text-xs">Negozio</Label>
          <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Es. Esselunga" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Prezzo</Label>
            <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
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
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opzionale" rows={2} />
        </div>
      </Card>

      <div className="fixed bottom-20 left-0 right-0 px-4 max-w-2xl mx-auto">
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salva prodotto
        </Button>
      </div>
    </div>
  );
}

export function UnitPriceFields({
  price,
  quantity,
  unit,
  multiPack,
  setMultiPack,
  itemsPerPack,
  setItemsPerPack,
  volumePerItem,
  setVolumePerItem,
}: {
  price: string;
  quantity: string;
  unit: string;
  multiPack: boolean;
  setMultiPack: (v: boolean) => void;
  itemsPerPack: string;
  setItemsPerPack: (v: string) => void;
  volumePerItem: string;
  setVolumePerItem: (v: string) => void;
}) {
  const unitLabel =
    unit === "l" || unit === "ml" ? "litri" : unit === "kg" || unit === "g" ? "kg" : "pezzi";
  const isWeightOrVolume = ["kg", "g", "l", "ml"].includes(unit);
  const p = Number(price);
  const preview =
    Number.isFinite(p) && p > 0
      ? calcUnitPrices(
          p,
          Number(quantity) || 1,
          unit,
          multiPack ? Math.max(1, Number(itemsPerPack) || 1) : 1,
          multiPack ? Number(volumePerItem) || 0 : 0,
        )
      : null;
  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border p-2">
        <Label htmlFor="multipack" className="text-xs cursor-pointer">
          Confezione multipla?
        </Label>
        <Switch id="multipack" checked={multiPack} onCheckedChange={setMultiPack} />
      </div>
      {multiPack && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">N° pezzi nella confezione</Label>
            <Input
              type="number"
              min="1"
              placeholder="Es. 6"
              value={itemsPerPack}
              onChange={(e) => setItemsPerPack(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Per pezzo (in {unitLabel})</Label>
            <Input
              type="number"
              step="0.001"
              placeholder="Es. 1.5"
              value={volumePerItem}
              onChange={(e) => setVolumePerItem(e.target.value)}
            />
          </div>
        </div>
      )}
      {preview && (
        <div className="rounded-md bg-muted/60 p-2 text-xs space-y-0.5">
          <div className="font-medium text-muted-foreground">Riepilogo prezzi unitari</div>
          <div>
            Totale: €{p.toFixed(2)} per {quantity || 1} {unit}
          </div>
          {preview.pricePerPiece !== null && (
            <div>Prezzo al pezzo: €{preview.pricePerPiece.toFixed(2)}</div>
          )}
          {(isWeightOrVolume || (multiPack && Number(volumePerItem) > 0)) && (
            <div>
              Prezzo al {preview.baseUnitLabel.replace("€/", "")}: €
              {preview.pricePerBaseUnit.toFixed(2)}
              {preview.baseUnitLabel}
            </div>
          )}
        </div>
      )}
    </>
  );
}