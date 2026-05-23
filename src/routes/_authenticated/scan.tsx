import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { scanReceiptUpload } from "@/lib/openai.functions";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, UNITS } from "@/lib/categories";
import { compressImage, cropImageToFile } from "@/lib/image-compress";
import { encodeReceiptKey } from "@/lib/receipt-key";
import { lazy, Suspense } from "react";
const ReceiptCrop = lazy(() =>
  import("@/components/receipt-crop").then((m) => ({ default: m.ReceiptCrop })),
);
type PixelCrop = { x: number; y: number; width: number; height: number };

export const Route = createFileRoute("/_authenticated/scan")({
  component: ScanPage,
});

type Item = {
  name_original: string;
  name_full: string;
  quantity: number;
  unit: string;
  price: number;
  category: string;
  selected: boolean;
};

type Step = "capture" | "crop" | "preview" | "analyzing" | "review";

type CapturedImage = {
  file: File; // compressed jpeg ready to upload
  preview: string; // data URL for thumbnail
};

const MAX_IMAGES = 5;

// Convert ISO YYYY-MM-DD to DD/MM/YYYY
const isoToIt = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const itToIso = (it: string) => {
  const m = it.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [images, setImages] = useState<CapturedImage[]>([]);
  // The image currently being cropped (added to `images` on confirm).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [store, setStore] = useState("");
  const [storeDetected, setStoreDetected] = useState(true);
  const [dateIso, setDateIso] = useState("");
  const [dateDetected, setDateDetected] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [zoom, setZoom] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [storeSuggestOpen, setStoreSuggestOpen] = useState(false);
  const [storeError, setStoreError] = useState(false);

  const scan = useServerFn(scanReceiptUpload);
  const qc = useQueryClient();

  // Recent scans (history)
  const recent = useQuery({
    queryKey: ["recent-scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("store_name, purchase_date, id")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const groups = new Map<
        string,
        { key: string; store: string | null; date: string; count: number }
      >();
      (data ?? []).forEach((r: any) => {
        const key = `${r.purchase_date}|${r.store_name ?? ""}`;
        const g = groups.get(key) ?? {
          key,
          store: r.store_name,
          date: r.purchase_date,
          count: 0,
        };
        g.count += 1;
        groups.set(key, g);
      });
      return Array.from(groups.values()).slice(0, 10);
    },
  });

  // Known stores for autocomplete
  const knownStores = useQuery({
    queryKey: ["known-stores"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("store_name")
        .not("store_name", "is", null)
        .limit(500);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r.store_name && set.add(r.store_name));
      return Array.from(set).sort();
    },
  });

  const storeMatches = useMemo(() => {
    const q = store.trim().toLowerCase();
    if (!q) return [];
    return (knownStores.data ?? [])
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, 5);
  }, [store, knownStores.data]);

  if (location.pathname !== "/scan") return <Outlet />;

  const handleFile = (file: File) => {
    setError(null);
    setPendingFile(file);
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      setPendingPreview(dataUrl);
      setStep("crop");
    };
    r.readAsDataURL(file);
  };

  const resetAll = () => {
    setStep("capture");
    setImages([]);
    setPendingFile(null);
    setPendingPreview(null);
    setError(null);
    setItems([]);
    setStore("");
    setDateIso("");
    setStoreDetected(true);
    setDateDetected(true);
  };

  const runAnalyze = async (imgs: CapturedImage[]) => {
    setStep("analyzing");
    setError(null);
    try {
      const formData = new FormData();
      imgs.forEach((img, idx) => formData.append("images", img.file, `receipt-${idx + 1}.jpg`));
      const result = await scan({ data: formData });
      const detectedStore = result.store_name ?? "";
      setStore(detectedStore);
      setStoreDetected(!!detectedStore);
      setDateIso(result.purchase_date ?? "");
      setDateDetected(!!result.purchase_date);
      const parsed: Item[] = (result.items ?? []).map((it: any) => ({
        name_original: it.name_original ?? "",
        name_full: it.name_full ?? it.name_original ?? "",
        quantity: it.quantity || 1,
        unit: (UNITS as readonly string[]).includes(it.unit) ? it.unit : "pz",
        price: it.price || 0,
        category: CATEGORIES.includes(it.category) ? it.category : "Altro",
        selected: true,
      }));
      setItems(parsed);
      if (parsed.length === 0) {
        setError("Nessun prodotto trovato nello scontrino");
        setStep("preview");
      } else {
        setStep("review");
      }
    } catch (e: any) {
      setError(toUserMessage(e, "Errore durante l'analisi dello scontrino"));
      setStep("preview");
    }
  };

  const analyze = async () => {
    if (images.length === 0) return;
    return runAnalyze(images);
  };

  const handleCropConfirm = async (pixelCrop: PixelCrop | null, imageEl: HTMLImageElement) => {
    try {
      let working: File;
      if (pixelCrop && pixelCrop.width > 0 && pixelCrop.height > 0) {
        working = await cropImageToFile(imageEl, pixelCrop);
      } else if (pendingFile) {
        working = pendingFile;
      } else {
        return;
      }
      const compressed = await compressImage(working);
      const dataUrl: string = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(compressed);
      });
      const b64 = dataUrl.split(",")[1] ?? "";
      console.log("[scan.mobile] prepared image", {
        kb: Math.round(compressed.size / 1024),
        base64KB: Math.round((b64.length * 0.75) / 1024),
      });
      setImages((arr) => [...arr, { file: compressed, preview: dataUrl }]);
      setPendingFile(null);
      setPendingPreview(null);
      setStep("preview");
    } catch (e: any) {
      setError(toUserMessage(e, "Errore preparazione immagine"));
      setStep("preview");
    }
  };

  const removeImage = (i: number) => setImages((arr) => arr.filter((_, idx) => idx !== i));

  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const addEmptyItem = () =>
    setItems((arr) => [
      ...arr,
      {
        name_original: "",
        name_full: "",
        quantity: 1,
        unit: "pz",
        price: 0,
        category: "Altro",
        selected: true,
      },
    ]);

  const selectedCount = items.filter((i) => i.selected).length;
  const estimatedTotal = items
    .filter((i) => i.selected)
    .reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

  const save = async () => {
    console.log("[scan.save] start", { itemsCount: items.length });
    const selected = items.filter((it) => it.selected && it.name_full.trim());
    if (selected.length === 0) {
      toast.error("Nessun prodotto selezionato");
      return;
    }
    if (!store.trim()) {
      setStoreError(true);
      toast.error("⚠️ Inserisci il nome del negozio prima di salvare");
      return;
    }
    setStoreError(false);
    let effectiveDate = dateIso;
    if (!effectiveDate) {
      effectiveDate = new Date().toISOString().slice(0, 10);
      setDateIso(effectiveDate);
      toast.warning("Data non rilevata: verrà usata la data di oggi");
    }
    setSaving(true);
    try {
      for (const [idx, item] of selected.entries()) {
        const cleanName = item.name_full.trim();
        console.log(`[scan.save] (${idx + 1}/${selected.length}) lookup`, cleanName);
        const { data: userData2 } = await supabase.auth.getUser();
        const uid = userData2.user?.id;
        if (!uid) throw new Error("Sessione scaduta, effettua di nuovo l'accesso");
        const { data: matches } = await supabase
          .from("products")
          .select("id, name")
          .ilike("name", cleanName)
          .limit(1);
        let productId = matches?.[0]?.id;
        if (!productId) {
          console.log("[scan.save] creating product", cleanName);
          const { data: created, error: pErr } = await supabase
            .from("products")
            .insert({ name: cleanName, category: item.category })
            .select("id")
            .single();
          if (pErr) {
            console.error("[scan.save] product insert error", pErr);
            // Possible duplicate (unique on name) — retry lookup without user filter
            const { data: retry } = await supabase
              .from("products")
              .select("id")
              .ilike("name", cleanName)
              .limit(1);
            if (retry?.[0]?.id) {
              productId = retry[0].id;
            } else {
              throw new Error(`Impossibile salvare il prodotto "${cleanName}"`);
            }
          } else {
            productId = created.id;
          }
        }
        const purchasePayload: any = {
          product_id: productId,
          store_name: store.trim() || null,
          price: item.price,
          quantity: item.quantity || 1,
          unit: item.unit,
          purchase_date: effectiveDate,
          notes: "Importato da scontrino",
        };
        console.log("[scan.save] inserting purchase", purchasePayload);
        const { error: puErr } = await supabase.from("purchases").insert(purchasePayload);
        if (puErr) {
          console.error("[scan.save] purchase insert error", puErr);
          throw new Error(`Impossibile salvare l'acquisto "${cleanName}"`);
        }
      }
      toast.success(`✅ ${selected.length} prodotti salvati con successo`);
      qc.invalidateQueries({ queryKey: ["recent-scans"] });
      qc.invalidateQueries({ queryKey: ["products-with-purchases"] });
      qc.invalidateQueries({ queryKey: ["known-stores"] });
      setTimeout(() => {
        resetAll();
        navigate({ to: "/" });
      }, 1500);
    } catch (e: any) {
      console.error("[scan.save] failed", e);
      toast.error(toUserMessage(e, "Errore salvataggio"));
    } finally {
      setSaving(false);
    }
  };

  // -------- RENDER --------

  // Full-screen review mode
  if (step === "review") {
    return (
      <div className="-mx-4 -my-2 min-h-[calc(100vh-6rem)] bg-background flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Revisione scontrino</h1>
            <Button size="icon" variant="ghost" onClick={resetAll} aria-label="Annulla">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="px-4 pb-3 space-y-3">
            {/* Negozio + autocomplete */}
            <div className="relative">
              <Label className="text-xs">Negozio</Label>
              <Input
                value={store}
                onChange={(e) => {
                  setStore(e.target.value);
                  setStoreSuggestOpen(true);
                  if (e.target.value.trim()) setStoreError(false);
                }}
                onFocus={() => setStoreSuggestOpen(true)}
                onBlur={() => setTimeout(() => setStoreSuggestOpen(false), 150)}
                placeholder="Es. Esselunga"
                className={
                  storeError
                    ? "border-destructive ring-2 ring-destructive"
                    : !storeDetected
                      ? "border-orange-500"
                      : ""
                }
              />
              {storeError && (
                <p className="text-xs text-destructive mt-1">Inserisci il nome del negozio</p>
              )}
              {storeSuggestOpen && storeMatches.length > 0 && (
                <Card className="absolute z-20 left-0 right-0 mt-1 p-1 max-h-48 overflow-auto">
                  {storeMatches.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setStore(s);
                        setStoreSuggestOpen(false);
                      }}
                      className="block w-full text-left px-2 py-2 text-sm rounded hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </Card>
              )}
            </div>

            {/* Data */}
            <div>
              <Label className="text-xs">Data acquisto</Label>
              <Input
                type="date"
                value={dateIso}
                onChange={(e) => {
                  setDateIso(e.target.value);
                  setDateDetected(true);
                }}
                className={!dateDetected || !dateIso ? "border-orange-500" : ""}
              />
              {(!dateDetected || !dateIso) && (
                <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Data non rilevata - inserisci manualmente
                </p>
              )}
              {dateIso && <p className="text-xs text-muted-foreground mt-1">{isoToIt(dateIso)}</p>}
            </div>

            {/* Thumbnails strip */}
            {images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setZoomIdx(i);
                      setZoom(true);
                    }}
                    className="relative shrink-0 rounded-md overflow-hidden border bg-muted h-20 w-20"
                  >
                    <img
                      src={img.preview}
                      alt={`scontrino ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] px-1">
                      {i + 1}/{images.length}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-56">
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
                    value={it.name_full}
                    onChange={(e) => updateItem(i, { name_full: e.target.value })}
                    placeholder="Nome prodotto"
                    className="font-medium"
                  />
                  {it.name_original && it.name_original !== it.name_full && (
                    <p className="text-[11px] text-muted-foreground pl-1">
                      Originale: {it.name_original}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Prezzo unit. €</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={it.price}
                        onChange={(e) => updateItem(i, { price: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Quantità</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={it.quantity}
                        onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Unità</Label>
                      <Select value={it.unit} onValueChange={(v) => updateItem(i, { unit: v })}>
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
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Categoria</Label>
                      <Select
                        value={it.category}
                        onValueChange={(v) => updateItem(i, { category: v })}
                      >
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
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeItem(i)}
                  aria-label="Rimuovi"
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}

          <Button variant="outline" className="w-full h-11 border-dashed" onClick={addEmptyItem}>
            <Plus className="h-4 w-4 mr-2" /> Aggiungi prodotto
          </Button>
        </div>

        {/* Footer */}
        <div className="fixed bottom-16 left-0 right-0 border-t bg-background px-4 py-3 space-y-2 z-50 shadow-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedCount} di {items.length} selezionati
            </span>
            <span className="font-semibold">Totale stimato: € {estimatedTotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-[52px] text-base"
              onClick={resetAll}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button
              className="flex-1 h-[52px] text-base bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={save}
              disabled={saving || selectedCount === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salva {selectedCount} {selectedCount === 1 ? "prodotto" : "prodotti"}
            </Button>
          </div>
        </div>

        {/* Zoom dialog */}
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent className="max-w-3xl p-2">
            {images[zoomIdx] && (
              <img
                src={images[zoomIdx].preview}
                alt="scontrino"
                className="w-full h-auto rounded"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Capture / preview / analyzing
  return (
    <div className="space-y-4 pb-8">
      {step === "crop" && pendingPreview && (
        <Suspense fallback={null}>
          <ReceiptCrop src={pendingPreview} onCancel={resetAll} onConfirm={handleCropConfirm} />
        </Suspense>
      )}
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

      {step === "capture" && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-32 flex-col gap-2"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-8 w-8" />
            <span>📷 Scatta foto</span>
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-32 flex-col gap-2"
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon className="h-8 w-8" />
            <span>🖼️ Carica dalla galleria</span>
          </Button>
        </div>
      )}

      {(step === "preview" || step === "analyzing") && images.length > 0 && (
        <Card className="p-3 space-y-3">
          {/* Thumbnails of all captured images */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <div
                key={i}
                className="relative shrink-0 rounded-md overflow-hidden border bg-muted h-28 w-28"
              >
                <img
                  src={img.preview}
                  alt={`pag ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-1"
                  aria-label="Rimuovi"
                  disabled={step === "analyzing"}
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                  {i + 1}/{images.length}
                </div>
              </div>
            ))}
            {images.length < MAX_IMAGES && step !== "analyzing" && (
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="shrink-0 rounded-md border border-dashed h-28 w-28 grid place-items-center text-xs text-muted-foreground hover:bg-muted/50"
              >
                <div className="flex flex-col items-center gap-1">
                  <Plus className="h-5 w-5" />
                  Aggiungi foto
                </div>
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            {images.length}/{MAX_IMAGES} foto · puoi aggiungere più foto per scontrini lunghi
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={resetAll}
              disabled={step === "analyzing"}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Annulla
            </Button>
            <Button className="flex-1 h-11" onClick={analyze} disabled={step === "analyzing"}>
              {step === "analyzing" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizzo...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Analizza scontrino
                </>
              )}
            </Button>
          </div>

          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
                <span
                  className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: "0.3s" }}
                />
              </div>
              <p className="text-sm text-muted-foreground">Sto analizzando lo scontrino... 🔍</p>
            </div>
          )}

          {error && step === "preview" && (
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

      {/* History */}
      {step === "capture" && (
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
                <Link
                  key={s.key + i}
                  to="/scan/$groupId"
                  params={{ groupId: encodeReceiptKey(s.store, s.date) }}
                >
                  <Card className="p-3 flex items-center justify-between hover:border-primary/40 transition-colors">
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
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
