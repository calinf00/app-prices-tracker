import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

function ShoppingListPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");

  const { data, isLoading } = useQuery({
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

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shopping_list").insert({
        product_name: name.trim(),
        quantity: Number(qty) || 1,
        is_purchased: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setQty("1");
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
      const { error } = await supabase.from("shopping_list").delete().eq("is_purchased", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista pulita");
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    add.mutate();
  };

  const hasPurchased = data?.some((i) => i.is_purchased);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <form onSubmit={submit} className="flex gap-2">
          <Input
            placeholder="Aggiungi prodotto..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
          <Input
            type="number"
            min="0"
            step="0.5"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-16"
          />
          <Button type="submit" size="icon" disabled={!name.trim() || add.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : data?.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          La lista è vuota. Aggiungi il primo prodotto!
        </Card>
      ) : (
        <div className="space-y-2">
          {data?.map((item) => (
            <Card
              key={item.id}
              className={`p-3 flex items-center gap-3 ${item.is_purchased ? "opacity-60" : ""}`}
            >
              <Checkbox
                checked={item.is_purchased}
                onCheckedChange={(v) => toggle.mutate({ id: item.id, value: !!v })}
              />
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${item.is_purchased ? "line-through" : ""}`}>
                  {item.product_name}
                </div>
                {item.quantity ? (
                  <div className="text-xs text-muted-foreground">
                    Quantità: {item.quantity} {item.unit ?? ""}
                  </div>
                ) : null}
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove.mutate(item.id)}
                aria-label="Elimina"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {hasPurchased && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => clearPurchased.mutate()}
          disabled={clearPurchased.isPending}
        >
          Svuota acquistati
        </Button>
      )}
    </div>
  );
}