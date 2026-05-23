import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Plus,
  Trash2,
  Sparkles,
  BookmarkPlus,
  ListPlus,
  Search,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UNITS } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/shopping-list")({
  component: ShoppingListPage,
});

type Item = {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  is_purchased: boolean;
};

type Suggestion = {
  id: string;
  name: string;
  brand: string | null;
  lastPrice: number | null;
  lastStore: string | null;
};

type Template = {
  id: string;
  name: string;
  items: { name: string; quantity: number; unit: string | null }[];
};

const TEMPLATES_KEY = "shopping-templates-v1";

function loadTemplates(): Template[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveTemplates(t: Template[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
}

function ShoppingListPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<string>("pz");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<Suggestion | null>(null);
  const [showFrequent, setShowFrequent] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => setTemplates(loadTemplates()), []);

  const { data: items, isLoading } = useQuery({
    queryKey: ["shopping_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list")
        .select("id, product_name, quantity, unit, is_purchased")
        .order("is_purchased", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  // Suggestions based on current input
  const trimmed = name.trim();
  const { data: suggestions } = useQuery({
    queryKey: ["product-suggestions", trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, brand, purchases(price, store_name, purchase_date)")
        .ilike("name", `%${trimmed}%`)
        .limit(6);
      return ((data ?? []) as any[]).map<Suggestion>((p) => {
        const sorted = [...(p.purchases ?? [])].sort(
          (a, b) =>
            new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime(),
        );
        const last = sorted[0];
        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          lastPrice: last ? Number(last.price) : null,
          lastStore: last?.store_name ?? null,
        };
      });
    },
  });

  // Reference prices: map product name -> latest price for cost estimate & display
  const { data: refPrices } = useQuery({
    queryKey: ["ref-prices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("name, purchases(price, store_name, purchase_date)")
        .limit(500);
      const map = new Map<string, { price: number; store: string | null }>();
      ((data ?? []) as any[]).forEach((p) => {
        const sorted = [...(p.purchases ?? [])].sort(
          (a, b) =>
            new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime(),
        );
        const last = sorted[0];
        if (last) {
          map.set(p.name.toLowerCase(), {
            price: Number(last.price),
            store: last.store_name ?? null,
          });
        }
      });
      return map;
    },
  });

  // Frequent products
  const { data: frequent, isLoading: freqLoading } = useQuery({
    queryKey: ["frequent-products"],
    enabled: showFrequent,
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("product_id, products(name)")
        .limit(1000);
      const counts = new Map<string, { name: string; count: number }>();
      ((data ?? []) as any[]).forEach((p) => {
        if (!p.product_id || !p.products?.name) return;
        const key = p.product_id;
        const entry = counts.get(key) ?? { name: p.products.name, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      });
      return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
  });

  const addItem = useMutation({
    mutationFn: async (payload: {
      product_name: string;
      quantity: number;
      unit: string | null;
    }) => {
      const { error } = await supabase.from("shopping_list").insert({
        product_name: payload.product_name,
        quantity: payload.quantity,
        unit: payload.unit,
        is_purchased: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setQty("1");
      setUnit("pz");
      setHighlighted(null);
      setSuggestOpen(false);
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("shopping_list")
        .update({ is_purchased: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping_list"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shopping_list").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping_list"] }),
  });

  const clearPurchased = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("shopping_list")
        .delete()
        .eq("is_purchased", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acquistati rimossi");
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const ids = (items ?? []).map((i) => i.id);
      if (ids.length === 0) return;
      const { error } = await supabase.from("shopping_list").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista svuotata");
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    addItem.mutate({
      product_name: highlighted?.name ?? trimmed,
      quantity: Number(qty) || 1,
      unit,
    });
  };

  const total = items?.length ?? 0;
  const done = items?.filter((i) => i.is_purchased).length ?? 0;
  const progress = total === 0 ? 0 : (done / total) * 100;

  const { estimate, estimated, missing } = useMemo(() => {
    if (!items || !refPrices) return { estimate: 0, estimated: 0, missing: 0 };
    let est = 0;
    let estCount = 0;
    let miss = 0;
    items
      .filter((i) => !i.is_purchased)
      .forEach((i) => {
        const ref = refPrices.get(i.product_name.toLowerCase());
        if (ref) {
          est += ref.price * (i.quantity ?? 1);
          estCount += 1;
        } else miss += 1;
      });
    return { estimate: est, estimated: estCount, missing: miss };
  }, [items, refPrices]);

  const addFrequent = (productName: string) => {
    addItem.mutate({ product_name: productName, quantity: 1, unit: "pz" });
  };

  const saveAsTemplate = () => {
    const list = (items ?? []).map((i) => ({
      name: i.product_name,
      quantity: i.quantity ?? 1,
      unit: i.unit,
    }));
    if (list.length === 0) {
      toast.error("La lista è vuota");
      return;
    }
    if (!tplName.trim()) {
      toast.error("Dai un nome alla lista tipo");
      return;
    }
    const next: Template[] = [
      ...templates,
      { id: crypto.randomUUID(), name: tplName.trim(), items: list },
    ];
    saveTemplates(next);
    setTemplates(next);
    setTplName("");
    setSaveTplOpen(false);
    toast.success("Lista tipo salvata");
  };

  const applyTemplate = async (tpl: Template) => {
    try {
      const rows = tpl.items.map((it) => ({
        product_name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        is_purchased: false,
      }));
      const { error } = await supabase.from("shopping_list").insert(rows);
      if (error) throw error;
      toast.success(`Lista "${tpl.name}" aggiunta`);
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Errore");
    }
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    saveTemplates(next);
    setTemplates(next);
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {done} di {total} acquistati
          </span>
          {estimated > 0 && (
            <span className="text-muted-foreground">
              ~ €{estimate.toFixed(2)}
              {missing > 0 && (
                <span className="ml-1 text-[10px]">({missing} senza prezzo)</span>
              )}
            </span>
          )}
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={done === 0 || clearPurchased.isPending}
            onClick={() => clearPurchased.mutate()}
          >
            Cancella acquistati
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={total === 0 || clearAll.isPending}
            onClick={() => {
              if (confirm("Svuotare tutta la lista?")) clearAll.mutate();
            }}
          >
            Svuota lista
          </Button>
        </div>
      </Card>

      {/* Add form */}
      <Card className="p-3 space-y-2">
        <form onSubmit={submit} className="space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca o aggiungi prodotto..."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setHighlighted(null);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.5"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-20"
            />
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              className="flex-1"
              disabled={!trimmed || addItem.isPending}
            >
              <Plus className="h-4 w-4 mr-1" /> Aggiungi
            </Button>
          </div>
        </form>

        {suggestOpen && trimmed.length >= 2 && (suggestions?.length ?? 0) > 0 && (
          <div className="border-t border-border pt-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
              In database
            </div>
            {suggestions!.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setName(s.name);
                  setHighlighted(s);
                  setSuggestOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  {s.brand && (
                    <div className="text-[10px] text-muted-foreground truncate">{s.brand}</div>
                  )}
                </div>
                {s.lastPrice !== null && (
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">€{s.lastPrice.toFixed(2)}</div>
                    {s.lastStore && (
                      <div className="text-[10px] text-muted-foreground truncate">{s.lastStore}</div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Smart actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setShowFrequent((v) => !v)}
        >
          <Sparkles className="h-4 w-4 mr-1" /> Frequenti
        </Button>
        <DropdownMenu open={showTemplates} onOpenChange={setShowTemplates}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <ListPlus className="h-4 w-4 mr-1" /> Liste tipo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Le tue liste tipo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {templates.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                Nessuna lista salvata
              </DropdownMenuItem>
            ) : (
              templates.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  className="flex items-center justify-between"
                  onSelect={(e) => e.preventDefault()}
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => {
                      applyTemplate(t);
                      setShowTemplates(false);
                    }}
                  >
                    <div className="text-sm">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t.items.length} prodotti
                    </div>
                  </button>
                  <button
                    className="ml-2 text-destructive"
                    onClick={() => deleteTemplate(t.id)}
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setShowTemplates(false);
                setSaveTplOpen(true);
              }}
            >
              <BookmarkPlus className="h-4 w-4 mr-2" />
              Salva lista corrente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showFrequent && (
        <Card className="p-3 space-y-2">
          <div className="text-xs text-muted-foreground">Prodotti più acquistati</div>
          {freqLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (frequent?.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">Ancora nessun dato.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {frequent!.map((f, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="secondary"
                  onClick={() => addFrequent(f.name)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {f.name}
                  <span className="ml-1 text-[10px] opacity-60">×{f.count}</span>
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : (items?.length ?? 0) === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          La lista è vuota. Aggiungi il primo prodotto!
        </Card>
      ) : (
        <div className="space-y-2">
          {items!.map((item) => (
            <ShoppingItemCard
              key={item.id}
              item={item}
              reference={refPrices?.get(item.product_name.toLowerCase()) ?? null}
              onToggle={(v) => toggle.mutate({ id: item.id, value: v })}
              onDelete={() => remove.mutate(item.id)}
            />
          ))}
        </div>
      )}

      {/* Save template dialog */}
      <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salva come lista tipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nome lista</Label>
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="Es. Spesa settimanale"
            />
            <p className="text-xs text-muted-foreground">
              Verranno salvati {items?.length ?? 0} prodotti attualmente in lista.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTplOpen(false)}>
              Annulla
            </Button>
            <Button onClick={saveAsTemplate}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShoppingItemCard({
  item,
  reference,
  onToggle,
  onDelete,
}: {
  item: Item;
  reference: { price: number; store: string | null } | null;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const startX = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -120));
  };
  const onTouchEnd = () => {
    if (offset < -80) {
      onDelete();
    }
    setOffset(0);
    startX.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background revealed on swipe */}
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-destructive text-destructive-foreground rounded-lg">
        <Trash2 className="h-4 w-4" />
      </div>
      <Card
        className={`relative p-3 flex items-center gap-3 transition-transform ${
          item.is_purchased ? "opacity-60" : ""
        }`}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <Checkbox
          checked={item.is_purchased}
          onCheckedChange={(v) => onToggle(!!v)}
        />
        <div className="flex-1 min-w-0">
          <div className={`font-medium truncate ${item.is_purchased ? "line-through" : ""}`}>
            {item.product_name}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {item.quantity ? `${item.quantity} ${item.unit ?? ""}` : ""}
            {reference && (
              <>
                {item.quantity ? " · " : ""}
                rif. €{reference.price.toFixed(2)}
                {reference.store ? ` @ ${reference.store}` : ""}
              </>
            )}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          aria-label="Elimina"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </Card>
    </div>
  );
}