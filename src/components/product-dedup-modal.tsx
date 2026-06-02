import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, X, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/user-errors";
import type { SimilarityCandidate } from "@/lib/product-similarity.functions";
import {
  mergeProductsFn,
  dismissDedupPairFn,
} from "@/lib/merge-products.functions";

export type DedupPair = SimilarityCandidate & {
  /** Temp product_id assigned to the new (just-scanned) product after first save. */
  newProductId: string;
  /** Optional note shown above the pair (e.g. re-surfaced previously dismissed). */
  note?: string;
};

type Decision = "merged" | "kept" | "dismissed";

interface Props {
  open: boolean;
  pairs: DedupPair[];
  onResolved: (decisions: Record<string, Decision>) => void;
  onClose: () => void;
}

export function ProductDedupModal({ open, pairs, onResolved, onClose }: Props) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [pending, setPending] = useState<string | null>(null);
  const merge = useServerFn(mergeProductsFn);
  const dismiss = useServerFn(dismissDedupPairFn);

  const remaining = pairs.filter((p) => !decisions[p.newProductId]);
  const allResolved = pairs.length > 0 && remaining.length === 0;

  const handleMerge = async (p: DedupPair) => {
    setPending(p.newProductId);
    try {
      await merge({
        data: {
          mergedProductId: p.newProductId,
          canonicalProductId: p.existingProductId,
        },
      });
      setDecisions((d) => ({ ...d, [p.newProductId]: "merged" }));
      toast.success(`Unito con "${p.existingProductName}"`);
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore unione"));
    } finally {
      setPending(null);
    }
  };

  const handleKeep = (p: DedupPair) => {
    setDecisions((d) => ({ ...d, [p.newProductId]: "kept" }));
  };

  const handleDismissForever = async (p: DedupPair) => {
    setPending(p.newProductId);
    try {
      await dismiss({
        data: { productIdA: p.newProductId, productIdB: p.existingProductId },
      });
      setDecisions((d) => ({ ...d, [p.newProductId]: "dismissed" }));
      toast.success("Non chiederò più per questo prodotto");
    } catch (e: any) {
      toast.error(toUserMessage(e, "Errore"));
    } finally {
      setPending(null);
    }
  };

  const finish = () => {
    onResolved(decisions);
    setDecisions({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Possibili duplicati rilevati</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Abbiamo trovato {pairs.length} prodotti che potrebbero essere uguali a prodotti esistenti.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {pairs.map((p) => {
            const decision = decisions[p.newProductId];
            const isPending = pending === p.newProductId;
            return (
              <Card key={p.newProductId} className="p-3 space-y-2">
                {p.note && (
                  <div className="text-xs text-amber-600 bg-amber-500/10 rounded px-2 py-1">
                    {p.note}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase text-muted-foreground">Nuovo</div>
                    <div className="font-medium truncate">{p.newProductName}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Esistente</div>
                    <div className="font-medium truncate">{p.existingProductName}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">
                    {Math.round(p.score * 100)}% simile
                  </Badge>
                  {decision && (
                    <Badge variant="outline" className="text-[10px]">
                      {decision === "merged"
                        ? "Unito"
                        : decision === "dismissed"
                          ? "Ignorato per sempre"
                          : "Mantenuto separato"}
                    </Badge>
                  )}
                </div>
                {!decision && (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleMerge(p)}
                      disabled={isPending}
                      className="whitespace-normal break-words text-center leading-tight min-h-[40px]"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Check className="h-4 w-4 mr-1.5" />
                      )}
                      Sì, è lo stesso prodotto
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleKeep(p)}
                        disabled={isPending}
                        className="whitespace-normal break-words text-center leading-tight min-h-[40px]"
                      >
                        <X className="h-4 w-4 mr-1.5" /> No, sono diversi
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismissForever(p)}
                        disabled={isPending}
                        className="whitespace-normal break-words text-center leading-tight min-h-[40px]"
                      >
                        <Ban className="h-4 w-4 mr-1.5" /> Non chiedere più
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={finish}
            className="w-full"
            disabled={!allResolved && pairs.length > 0}
          >
            {allResolved ? "Continua" : `Risolvi tutti (${remaining.length} rimasti)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}