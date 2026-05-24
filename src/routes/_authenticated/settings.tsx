import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useEffect, useMemo, useState } from "react";
import { LogOut, Moon, Sun, Plus, X, Download, Store, Tag, User as UserIcon, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const CATS_KEY = "custom-categories-v1";
const STORES_KEY = "preferred-stores-v1";

function loadList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const initialName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "";
  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);

  const [cats, setCats] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [stores, setStores] = useState<string[]>([]);
  const [newStore, setNewStore] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setCats(loadList(CATS_KEY));
    setStores(loadList(STORES_KEY));
  }, []);

  const nameError = useMemo(() => (name.trim().length === 0 ? "Il nome è obbligatorio" : ""), [name]);

  const saveName = async () => {
    if (nameError) {
      toast.error(nameError);
      return;
    }
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingName(false);
    if (error) toast.error(toUserMessage(error));
    else toast.success("Nome aggiornato");
  };

  const addCat = () => {
    const v = newCat.trim();
    if (!v) return toast.error("Nome categoria obbligatorio");
    if (cats.some((c) => c.toLowerCase() === v.toLowerCase())) return toast.error("Categoria già presente");
    const next = [...cats, v];
    setCats(next);
    saveList(CATS_KEY, next);
    setNewCat("");
    toast.success("Categoria aggiunta");
  };
  const removeCat = (v: string) => {
    const next = cats.filter((c) => c !== v);
    setCats(next);
    saveList(CATS_KEY, next);
    toast.success("Categoria eliminata");
  };

  const addStore = () => {
    const v = newStore.trim();
    if (!v) return toast.error("Nome negozio obbligatorio");
    if (stores.some((s) => s.toLowerCase() === v.toLowerCase())) return toast.error("Negozio già presente");
    const next = [...stores, v];
    setStores(next);
    saveList(STORES_KEY, next);
    setNewStore("");
    toast.success("Negozio aggiunto");
  };
  const removeStore = (v: string) => {
    const next = stores.filter((s) => s !== v);
    setStores(next);
    saveList(STORES_KEY, next);
    toast.success("Negozio eliminato");
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "purchase_date, store_name, price, quantity, unit, notes, products(name, brand, category)",
        )
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) {
        toast.error("Nessun acquisto da esportare");
        return;
      }
      const header = ["Data", "Prodotto", "Brand", "Categoria", "Negozio", "Prezzo", "Quantità", "Unità", "Note"];
      const lines = [header.join(",")];
      for (const r of rows as any[]) {
        lines.push(
          [
            r.purchase_date,
            r.products?.name ?? "",
            r.products?.brand ?? "",
            r.products?.category ?? "",
            r.store_name ?? "",
            r.price,
            r.quantity ?? "",
            r.unit ?? "",
            r.notes ?? "",
          ].map(csvEscape).join(","),
        );
      }
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acquisti-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Esportati ${rows.length} acquisti`);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore nell'esportazione"));
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(toUserMessage(error));
    else {
      toast.success("Disconnesso");
      navigate({ to: "/auth" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Account / nome */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserIcon className="h-4 w-4 text-muted-foreground" /> Account
        </div>
        <div className="text-xs text-muted-foreground break-all">{user?.email}</div>
        <div className="space-y-1">
          <Label htmlFor="name" className="text-xs">Nome visualizzato</Label>
          <div className="flex flex-wrap items-stretch gap-2">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Il tuo nome"
              maxLength={60}
              className="h-11 flex-1 min-w-0"
              aria-invalid={!!nameError}
            />
            <Button
              onClick={saveName}
              disabled={savingName || !!nameError}
              className="h-auto min-h-[44px] shrink-0 whitespace-nowrap min-w-[80px] w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-1" /> Salva
            </Button>
          </div>
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
      </Card>

      {/* Tema */}
      <Card className="p-5 flex items-center justify-between gap-3 min-h-[60px]">
        <div className="flex items-center gap-3">
          {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          <div>
            <Label htmlFor="theme-switch" className="font-medium">Tema scuro</Label>
            <div className="text-xs text-muted-foreground">Cambia aspetto dell'app</div>
          </div>
        </div>
        <Switch
          id="theme-switch"
          checked={theme === "dark"}
          onCheckedChange={(c) => {
            setTheme(c ? "dark" : "light");
            toast.success(c ? "Tema scuro attivo" : "Tema chiaro attivo");
          }}
        />
      </Card>

      {/* Categorie personalizzate */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Tag className="h-4 w-4 text-muted-foreground" /> Categorie personalizzate
        </div>
        <div className="flex gap-2">
          <Input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCat())}
            placeholder="Nuova categoria"
            maxLength={40}
            className="h-11"
          />
          <Button onClick={addCat} className="h-11" aria-label="Aggiungi categoria">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {cats.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nessuna categoria personalizzata. Aggiungine una per organizzare i tuoi prodotti.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-muted text-sm"
              >
                {c}
                <button
                  onClick={() => removeCat(c)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-destructive/15 hover:text-destructive"
                  aria-label={`Elimina ${c}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Negozi preferiti */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Store className="h-4 w-4 text-muted-foreground" /> Negozi preferiti
        </div>
        <div className="flex gap-2">
          <Input
            value={newStore}
            onChange={(e) => setNewStore(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStore())}
            placeholder="Es. Conad, Esselunga..."
            maxLength={60}
            className="h-11"
          />
          <Button onClick={addStore} className="h-11" aria-label="Aggiungi negozio">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {stores.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nessun negozio preferito. Aggiungi i negozi che frequenti di più.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {stores.map((s) => (
              <li key={s} className="flex items-center justify-between py-2 min-h-[44px]">
                <span className="text-sm">{s}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeStore(s)}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  aria-label={`Elimina ${s}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Esporta dati */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Download className="h-4 w-4 text-muted-foreground" /> Esporta dati
        </div>
        <p className="text-xs text-muted-foreground">
          Scarica un file CSV con tutto lo storico dei tuoi acquisti.
        </p>
        <Button onClick={exportCsv} disabled={exporting} className="w-full h-11" variant="secondary">
          <Download className="h-4 w-4 mr-2" />
          {exporting ? "Esportazione..." : "Esporta CSV"}
        </Button>
      </Card>

      <Button variant="destructive" onClick={handleLogout} className="w-full h-11">
        <LogOut className="h-4 w-4 mr-2" />
        Esci
      </Button>
    </div>
  );
}