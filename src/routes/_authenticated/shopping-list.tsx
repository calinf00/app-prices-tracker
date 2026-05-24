import { createFileRoute } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Plus,
  Trash2,
  Settings as SettingsIcon,
  Sparkles,
  Package,
  Clock,
  Bot,
  Pencil,
  Check,
  X,
  Loader2,
  UserPlus,
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
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { UNITS } from "@/lib/categories";
import { estimatePrice, smartShoppingList } from "@/lib/openai.functions";
import { convertToBaseUnit, baseUnitOf, isSubUnit, calcUnitPrices, estimateCost } from "@/lib/unit-conversion";
import { useFamily } from "@/hooks/use-family";
import { useAuth } from "@/hooks/use-auth";
import { FamilyAvatar } from "@/components/family-avatar";

export const Route = createFileRoute("/_authenticated/shopping-list")({
  component: ShoppingListPage,
});

type Item = {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  is_purchased: boolean;
  created_at?: string;
  user_id?: string | null;
  assigned_to?: string | null;
};

type PriceRange = {
  min: number;
  max: number;
  source: "history" | "ai";
  /** Unit the price refers to (e.g. "kg", "l", "pz"). Used to convert when the item is in g/ml. */
  priceUnit?: string;
};

type ProductStat = {
  id: string;
  name: string;
  brand: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  count: number;
  priceUnit?: string | null;
};

type Template = {
  id: string;
  name: string;
  items: { name: string; quantity: number; unit: string | null }[];
};

const TEMPLATES_KEY = "shopping-templates-v1";
const RECENTS_KEY = "shopping-recents-v1";
const AI_PRICE_CACHE_KEY = "shopping-ai-prices-v1";

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function pushRecent(name: string) {
  const list = loadJSON<string[]>(RECENTS_KEY, []);
  const next = [name, ...list.filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 20);
  saveJSON(RECENTS_KEY, next);
}

function ShoppingListPage() {
  const qc = useQueryClient();
  const estimatePriceFn = useServerFn(estimatePrice);
  const smartListFn = useServerFn(smartShoppingList);
  const { user } = useAuth();
  const family = useFamily();
  const hasFamily = !!family.family;
  const [scope, setScope] = useState<"mine" | "family">("family");

  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<string>("pz");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [aiCache, setAiCache] = useState<Record<string, PriceRange>>({});

  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [loadTplOpen, setLoadTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  const [smartOpen, setSmartOpen] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartThreshold, setSmartThreshold] = useState<"7" | "14" | "30">("14");
  const [smartSuggestions, setSmartSuggestions] = useState<
    { name: string; reason: string; selected: boolean }[]
  >([]);

  useEffect(() => {
    setTemplates(loadJSON<Template[]>(TEMPLATES_KEY, []));
    setRecents(loadJSON<string[]>(RECENTS_KEY, []));
    setAiCache(loadJSON<Record<string, PriceRange>>(AI_PRICE_CACHE_KEY, {}));
  }, []);

  const { data: items, isLoading } = useQuery({
    queryKey: ["shopping_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopping_list")
        .select("id, product_name, quantity, unit, is_purchased, created_at, user_id, assigned_to")
        .order("is_purchased", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  // Realtime sync for family-shared list
  useEffect(() => {
    const channel = supabase
      .channel("family-shopping-list-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_list" },
        () => {
          qc.invalidateQueries({ queryKey: ["shopping_list"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const visibleItems = useMemo(() => {
    if (!items) return [] as Item[];
    if (!hasFamily || scope === "family") return items;
    return items.filter((i) => !i.user_id || (user && i.user_id === user.id));
  }, [items, scope, hasFamily, user]);

  // Full product catalog with min/max prices for ranges + suggestions
  const { data: productStats } = useQuery({
    queryKey: ["product-stats"],
    queryFn: async () => {
      let { data } = (await supabase
        .from("products")
        .select(
          "id, name, brand, purchases(price, quantity, unit, price_per_base_unit, base_unit, purchase_date)",
        )
        .limit(1000)) as { data: any[] | null };
      if (!data) {
        const fallback = await supabase
          .from("products")
          .select("id, name, brand, purchases(price, quantity, unit, purchase_date)")
          .limit(1000);
        data = (fallback.data as any[]) ?? null;
      }
      const stats = ((data ?? []) as any[]).map<ProductStat>((p) => {
        const purchases = (p.purchases ?? []) as any[];
        const unitPrices = purchases
          .map((x) => {
            const price = Number(x.price);
            if (!Number.isFinite(price) || price <= 0) return null;
            const qty = Number(x.quantity) || 1;
            const stored = x.price_per_base_unit != null ? Number(x.price_per_base_unit) : null;
            const calc = stored
              ? { pricePerBaseUnit: stored, baseUnitLabel: `€/${x.base_unit ?? "pz"}` }
              : calcUnitPrices(price, qty, x.unit ?? "pz");
            return {
              pricePerBaseUnit: calc.pricePerBaseUnit,
              baseUnit: (x.base_unit ?? calc.baseUnitLabel.replace("€/", "")) as string,
              date: x.purchase_date as string,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const sorted = [...unitPrices].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        const last = sorted[0] ?? null;
        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          minPrice: unitPrices.length ? Math.min(...unitPrices.map((x) => x.pricePerBaseUnit)) : null,
          maxPrice: unitPrices.length ? Math.max(...unitPrices.map((x) => x.pricePerBaseUnit)) : null,
          count: unitPrices.length,
          priceUnit: last?.baseUnit ?? null,
        };
      });
      return stats;
    },
  });

  const statsByName = useMemo(() => {
    const m = new Map<string, ProductStat>();
    (productStats ?? []).forEach((s) => m.set(s.name.toLowerCase().trim(), s));
    return m;
  }, [productStats]);

  // Build autocomplete suggestions
  const trimmed = name.trim();
  const lowerQ = trimmed.toLowerCase();
  const suggestions = useMemo(() => {
    if (trimmed.length < 1) return [] as { type: "product" | "recent"; label: string; meta?: string }[];
    const out: { type: "product" | "recent"; label: string; meta?: string }[] = [];
    const seen = new Set<string>();
    (productStats ?? [])
      .filter((p) => p.name.toLowerCase().includes(lowerQ))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .forEach((p) => {
        const k = p.name.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push({
          type: "product",
          label: p.name,
          meta: p.brand ?? undefined,
        });
      });
    recents
      .filter((r) => r.toLowerCase().includes(lowerQ))
      .slice(0, 4)
      .forEach((r) => {
        const k = r.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ type: "recent", label: r });
      });
    return out.slice(0, 8);
  }, [productStats, recents, lowerQ, trimmed]);

  // Mutations
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
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      pushRecent(payload.product_name);
    },
    onSuccess: () => {
      setName("");
      setQty("1");
      setUnit("pz");
      setSuggestOpen(false);
      setActiveIdx(-1);
      setRecents(loadJSON<string[]>(RECENTS_KEY, []));
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
  });

  const assignToMe = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase
        .from("shopping_list")
        .update({ assigned_to: user.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assegnato a te");
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
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

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      quantity,
      unit,
    }: {
      id: string;
      quantity: number;
      unit: string;
    }) => {
      const { error } = await supabase
        .from("shopping_list")
        .update({ quantity, unit })
        .eq("id", id);
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
      product_name: trimmed,
      quantity: Number(qty) || 1,
      unit,
    });
  };

  const pickSuggestion = (label: string) => {
    setName(label);
    setSuggestOpen(false);
    setActiveIdx(-1);
  };

  // Resolve price range for an item (history -> ai cache -> fetch)
  const getRange = (productName: string): PriceRange | null => {
    const stat = statsByName.get(productName.toLowerCase().trim());
    if (stat && stat.minPrice !== null && stat.maxPrice !== null) {
      return {
        min: stat.minPrice,
        max: stat.maxPrice,
        source: "history",
        priceUnit: stat.priceUnit ?? undefined,
      };
    }
    const cached = aiCache[productName.toLowerCase().trim()];
    if (cached) return cached;
    return null;
  };

  // Trigger AI price estimates for items without ranges
  const pendingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!items || !productStats) return;
    items.forEach(async (it) => {
      const key = it.product_name.toLowerCase().trim();
      if (statsByName.has(key)) return;
      if (aiCache[key]) return;
      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      try {
        const res = await estimatePriceFn({ data: { productName: it.product_name } });
        if (res.min > 0 || res.max > 0) {
          setAiCache((prev) => {
            const next = {
              ...prev,
              [key]: {
                min: res.min,
                max: res.max,
                source: "ai" as const,
                priceUnit: baseUnitOf(res.unit),
              },
            };
            saveJSON(AI_PRICE_CACHE_KEY, next);
            return next;
          });
        }
      } catch {
        // ignore
      } finally {
        pendingRef.current.delete(key);
      }
    });
  }, [items, productStats, statsByName, aiCache, estimatePriceFn]);

  // Totals
  const total = items?.length ?? 0;
  const done = items?.filter((i) => i.is_purchased).length ?? 0;
  const progress = total === 0 ? 0 : (done / total) * 100;

  const { totalMin, totalMax } = useMemo(() => {
    let min = 0;
    let max = 0;
    (items ?? [])
      .filter((i) => !i.is_purchased)
      .forEach((i) => {
        const r = getRange(i.product_name);
        if (!r) return;
        const rawQty = i.quantity ?? 1;
        min += estimateCost(r.min, rawQty, i.unit ?? "pz");
        max += estimateCost(r.max, rawQty, i.unit ?? "pz");
      });
    return { totalMin: min, totalMax: max };
  }, [items, statsByName, aiCache]);

  // Templates
  const saveAsTemplate = () => {
    const list = (items ?? []).map((i) => ({
      name: i.product_name,
      quantity: i.quantity ?? 1,
      unit: i.unit,
    }));
    if (list.length === 0) return toast.error("La lista è vuota");
    if (!tplName.trim()) return toast.error("Dai un nome alla lista tipo");
    const next = [...templates, { id: crypto.randomUUID(), name: tplName.trim(), items: list }];
    saveJSON(TEMPLATES_KEY, next);
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
        user_id: user?.id ?? null,
      }));
      const { error } = await supabase.from("shopping_list").insert(rows);
      if (error) throw error;
      toast.success(`Lista "${tpl.name}" aggiunta`);
      setLoadTplOpen(false);
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore"));
    }
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    saveJSON(TEMPLATES_KEY, next);
    setTemplates(next);
  };

  const runSmartList = async () => {
    setSmartLoading(true);
    try {
      const res = await smartListFn({
        data: { thresholdDays: Number(smartThreshold) },
      });
      setSmartSuggestions(
        res.suggestions.map((s: { name: string; reason: string }) => ({
          ...s,
          selected: true,
        })),
      );
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore AI"));
    } finally {
      setSmartLoading(false);
    }
  };

  const addSmartSelected = async () => {
    const picks = smartSuggestions.filter((s) => s.selected);
    if (picks.length === 0) return setSmartOpen(false);
    try {
      const { error } = await supabase
        .from("shopping_list")
        .insert(
          picks.map((p) => ({
            product_name: p.name,
            quantity: 1,
            unit: "pz",
            is_purchased: false,
            user_id: user?.id ?? null,
          })),
        );
      if (error) throw error;
      toast.success(`${picks.length} prodotti aggiunti`);
      picks.forEach((p) => pushRecent(p.name));
      setRecents(loadJSON<string[]>(RECENTS_KEY, []));
      setSmartOpen(false);
      setSmartSuggestions([]);
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore"));
    }
  };

  const onKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Tab" && activeIdx >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIdx].label);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">Lista della Spesa</h1>
            <p className="text-xs text-muted-foreground">
              {done} di {total} acquistati
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Opzioni"
                className="h-11 w-11"
              >
                <SettingsIcon className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Opzioni lista</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSaveTplOpen(true)}>
                Salva come lista tipo
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLoadTplOpen(true)}>
                Carica lista tipo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={done === 0}
                onSelect={() => clearPurchased.mutate()}
              >
                Cancella acquistati
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={total === 0}
                className="text-destructive"
                onSelect={() => {
                  if (confirm("Svuotare tutta la lista?")) clearAll.mutate();
                }}
              >
                Svuota lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Progress
          value={progress}
          className="h-2 [&>div]:bg-emerald-500 bg-emerald-500/15"
        />
        {(totalMin > 0 || totalMax > 0) && (
          <div className="text-sm flex items-baseline gap-2">
            <span className="text-muted-foreground">Spesa stimata:</span>
            <span className="font-semibold tabular-nums">
              €{totalMin.toFixed(2)} - €{totalMax.toFixed(2)}
            </span>
          </div>
        )}
      </Card>

      {/* Add product */}
      <Card className="p-3 space-y-2">
        <form onSubmit={submit} className="space-y-2">
          <div className="relative">
            <Input
              placeholder="Aggiungi prodotto..."
              value={name}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setSuggestOpen(true);
                setActiveIdx(-1);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onKeyDown={onKeyDownInput}
              className="h-11"
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    type="button"
                    key={`${s.type}-${s.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(s.label)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm ${
                      i === activeIdx ? "bg-accent" : "hover:bg-accent"
                    }`}
                  >
                    {s.type === "product" ? (
                      <Package className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 truncate">{s.label}</span>
                    {s.meta && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {s.meta}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {suggestOpen && trimmed.length >= 1 && suggestions.length === 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                Aggiungi “{trimmed}” come nuovo prodotto
              </div>
            )}
          </div>
          {trimmed.length > 0 && (
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-20 h-11"
                aria-label="Quantità"
              />
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-24 h-11">
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
              <Button
                type="submit"
                className="flex-1 h-11"
                disabled={!trimmed || addItem.isPending}
              >
                <Plus className="h-4 w-4 mr-1" /> Aggiungi
              </Button>
            </div>
          )}
        </form>
      </Card>

      {/* AI Smart list button */}
      <Button
        variant="outline"
        className="w-full h-12 border-emerald-500/40 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
        onClick={() => {
          setSmartOpen(true);
          setSmartSuggestions([]);
        }}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Genera lista con AI
      </Button>

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
              range={getRange(item.product_name)}
              onToggle={(v) => toggle.mutate({ id: item.id, value: v })}
              onDelete={() => remove.mutate(item.id)}
              onUpdate={(quantity, unit) =>
                updateItem.mutate({ id: item.id, quantity, unit })
              }
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

      {/* Load template dialog */}
      <Dialog open={loadTplOpen} onOpenChange={setLoadTplOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carica lista tipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nessuna lista tipo salvata.
              </p>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 border border-border rounded-md p-2"
                >
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => applyTemplate(t)}
                  >
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t.items.length} prodotti
                    </div>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive h-9 w-9"
                    onClick={() => deleteTemplate(t.id)}
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Smart AI dialog */}
      <Dialog open={smartOpen} onOpenChange={setSmartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-500" />
              Genera lista della spesa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Soglia giorni</Label>
              <Select
                value={smartThreshold}
                onValueChange={(v) => setSmartThreshold(v as "7" | "14" | "30")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 giorni</SelectItem>
                  <SelectItem value="14">14 giorni</SelectItem>
                  <SelectItem value="30">30 giorni</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={runSmartList}
                disabled={smartLoading}
                className="shrink-0"
              >
                {smartLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Analizza"
                )}
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1">
              {smartLoading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!smartLoading && smartSuggestions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Premi “Analizza” per ottenere suggerimenti dall'AI in base al
                  tuo storico acquisti.
                </p>
              )}
              {smartSuggestions.map((s, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={s.selected}
                    onCheckedChange={(v) =>
                      setSmartSuggestions((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, selected: !!v } : p)),
                      )
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    {s.reason && (
                      <div className="text-[10px] text-muted-foreground">
                        {s.reason}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmartOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={addSmartSelected}
              disabled={smartSuggestions.filter((s) => s.selected).length === 0}
            >
              Aggiungi selezionati
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShoppingItemCard({
  item,
  range,
  onToggle,
  onDelete,
  onUpdate,
}: {
  item: Item;
  range: PriceRange | null;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
  onUpdate: (quantity: number, unit: string) => void;
}) {
  const startX = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editQty, setEditQty] = useState(String(item.quantity ?? 1));
  const [editUnit, setEditUnit] = useState(item.unit ?? "pz");

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -120));
  };
  const onTouchEnd = () => {
    if (offset < -80) onDelete();
    setOffset(0);
    startX.current = null;
  };

  const saveEdit = () => {
    const q = Number(editQty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Quantità non valida");
      return;
    }
    onUpdate(q, editUnit);
    setEditing(false);
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-destructive text-destructive-foreground rounded-lg">
        <Trash2 className="h-4 w-4" />
      </div>
      <Card
        className={`relative p-3 flex items-center gap-3 transition-transform min-h-[64px] ${
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
          className="h-5 w-5"
        />
        <div className="flex-1 min-w-0">
          <div
            className={`font-medium truncate ${
              item.is_purchased ? "line-through" : ""
            }`}
          >
            {item.product_name}
          </div>
          {editing ? (
            <div className="flex items-center gap-1 mt-1">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                className="h-8 w-16 text-xs"
              />
              <Select value={editUnit} onValueChange={setEditUnit}>
                <SelectTrigger className="h-8 w-20 text-xs">
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
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={saveEdit}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditing(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
              <span>
                {item.quantity ?? 1} {item.unit ?? ""}
              </span>
              {range ? (
                (() => {
                  const rawQty = item.quantity ?? 1;
                  const priceUnit = range.priceUnit ?? baseUnitOf(item.unit);
                  const converted =
                    isSubUnit(item.unit) && (priceUnit === "kg" || priceUnit === "l");
                  const q = converted ? convertToBaseUnit(rawQty, item.unit) : rawQty;
                  const subMin = range.min * q;
                  const subMax = range.max * q;
                  return (
                    <span
                      className="text-muted-foreground/80"
                      title={
                        converted
                          ? `Prezzo €${range.min.toFixed(2)}-${range.max.toFixed(2)}/${priceUnit} calcolato su ${rawQty} ${item.unit}`
                          : undefined
                      }
                    >
                      €{subMin.toFixed(2)} - €{subMax.toFixed(2)}
                      {converted && (
                        <span className="ml-1 text-[10px] text-muted-foreground/70">
                          (€{range.min.toFixed(2)}/{priceUnit})
                        </span>
                      )}
                      {range.source === "ai" && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px]">
                          <Bot className="h-3 w-3" />
                          stima AI
                        </span>
                      )}
                    </span>
                  );
                })()
              ) : (
                <span className="text-muted-foreground/60 italic">
                  prezzo in stima...
                </span>
              )}
            </div>
          )}
        </div>
        {!editing && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => setEditing(true)}
              aria-label="Modifica"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={onDelete}
              aria-label="Elimina"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}