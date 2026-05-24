import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Check, X, Users } from "lucide-react";
import { useFamily } from "@/hooks/use-family";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/user-errors";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [{ title: "Notifiche" }],
  }),
  component: NotificationsPage,
});

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("it-IT");
  } catch {
    return iso;
  }
}

function NotificationsPage() {
  const family = useFamily();
  const invites = family.myInvites ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Notifiche</h2>
      </div>

      {invites.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nessuna notifica al momento.
        </Card>
      ) : (
        <div className="space-y-3">
          {invites.map((inv) => (
            <Card key={inv.id} className="p-4 border-l-4 border-l-primary">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    Invito a unirti a "{inv.families?.name ?? "una famiglia"}"
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Scade il {formatDate(inv.expires_at)}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() =>
                        family
                          .acceptInvite(inv)
                          .then(() => toast.success("Sei entrato nella famiglia!"))
                          .catch((e) => toast.error(toUserMessage(e as Error)))
                      }
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accetta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        family
                          .declineInvite(inv.id)
                          .then(() => toast.success("Invito rifiutato"))
                          .catch((e) => toast.error(toUserMessage(e as Error)))
                      }
                    >
                      <X className="h-4 w-4 mr-1" />
                      Rifiuta
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="pt-2">
        <Link
          to="/family"
          className="text-sm text-primary hover:underline"
        >
          Vai alla pagina Famiglia →
        </Link>
      </div>
    </div>
  );
}