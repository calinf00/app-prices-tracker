import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useFamily } from "@/hooks/use-family";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Users,
  Copy,
  RefreshCw,
  Pencil,
  Check,
  X,
  Trash2,
  Mail,
  LogOut,
  Loader2,
  Bell,
} from "lucide-react";
import { toUserMessage } from "@/lib/user-errors";
import type { FamilyInvite } from "@/lib/supabase-types";

export const Route = createFileRoute("/_authenticated/family")({
  component: FamilyPage,
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function FamilyPage() {
  const { user } = useAuth();
  const f = useFamily();

  if (f.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Caricamento...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {f.myInvites.length > 0 && (
        <ReceivedInvites
          invites={f.myInvites}
          onAccept={(inv) =>
            f
              .acceptInvite(inv)
              .then(() => {
                toast.success("Sei entrato nella famiglia!");
                window.location.reload();
              })
              .catch((e) => toast.error(toUserMessage(e)))
          }
          onDecline={(id) =>
            f
              .declineInvite(id)
              .then(() => toast.success("Invito rifiutato"))
              .catch((e) => toast.error(toUserMessage(e)))
          }
        />
      )}

      {!f.family ? (
        <NoFamily onCreate={f.createFamily} onJoin={f.joinByCode} />
      ) : (
        <>
          <FamilyHeader
            name={f.family.name}
            isOwner={f.isOwner}
            onRename={(n) => f.renameFamily(n).then(() => toast.success("Nome aggiornato")).catch((e) => toast.error(toUserMessage(e)))}
          />

          {f.isOwner && (
            <InviteCodeCard
              code={f.family.invite_code}
              onRegenerate={() =>
                f.regenerateCode().then(() => toast.success("Codice rigenerato")).catch((e) => toast.error(toUserMessage(e)))
              }
            />
          )}

          <MembersCard
            members={f.members}
            currentUserId={user?.id ?? ""}
            ownerId={f.family.created_by}
            isOwner={f.isOwner}
            onRemove={(id) =>
              f.removeMember(id).then(() => toast.success("Membro rimosso")).catch((e) => toast.error(toUserMessage(e)))
            }
          />

          {f.isOwner && (
            <>
              <InvitesCard
                invites={f.invites}
                onInvite={(email) =>
                  f
                    .inviteByEmail(email)
                    .then(() => toast.success("Invito inviato"))
                    .catch((e) => toast.error(toUserMessage(e)))
                }
                onRevoke={(id) =>
                  f.revokeInvite(id).then(() => toast.success("Invito revocato")).catch((e) => toast.error(toUserMessage(e)))
                }
              />
              <DangerZone
                familyName={f.family.name}
                onDelete={() =>
                  f
                    .deleteFamily()
                    .then(() => toast.success("Famiglia eliminata"))
                    .catch((e) => toast.error(toUserMessage(e)))
                }
              />
            </>
          )}

          {!f.isOwner && (
            <Card className="p-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <LogOut className="h-4 w-4 mr-2" /> Abbandona famiglia
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Non vedrai più i dati condivisi con questa famiglia.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        f.leaveFamily().then(() => toast.success("Hai abbandonato la famiglia")).catch((e) => toast.error(toUserMessage(e)))
                      }
                    >
                      Abbandona
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function NoFamily({
  onCreate,
  onJoin,
}: {
  onCreate: (name: string) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  return (
    <div className="space-y-4 max-w-md mx-auto pt-6">
      <div className="text-center space-y-2">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center">
          <Users className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">Famiglia</h2>
        <p className="text-sm text-muted-foreground">
          Condividi prodotti, acquisti e lista della spesa con chi vivi.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <Label>Crea una nuova famiglia</Label>
          <Input placeholder="Es. Famiglia Rossi" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          className="w-full"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("create");
            setCreateError(null);
            try {
              await onCreate(name);
              toast.success("Famiglia creata");
            } catch (e) {
              const msg = (e as Error).message || toUserMessage(e as Error);
              setCreateError(msg);
              toast.error(msg);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea"}
        </Button>
        {createError && (
          <div className="text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-2 whitespace-pre-wrap">
            {createError}
          </div>
        )}
      </Card>

      <div className="text-center text-xs uppercase tracking-wider text-muted-foreground">oppure</div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <Label>Unisciti con codice invito</Label>
          <Input
            placeholder="ABC12XYZ"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            className="uppercase tracking-widest font-mono"
          />
        </div>
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy !== null || code.trim().length < 4}
          onClick={async () => {
            setBusy("join");
            try {
              await onJoin(code);
              toast.success("Ti sei unito alla famiglia");
            } catch (e) {
              toast.error(toUserMessage(e as Error));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unisciti"}
        </Button>
      </Card>
    </div>
  );
}

function FamilyHeader({
  name,
  isOwner,
  onRename,
}: {
  name: string;
  isOwner: boolean;
  onRename: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center">
        <Users className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <Button size="icon" variant="ghost" onClick={() => { onRename(value); setEditing(false); }}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { setValue(name); setEditing(false); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="font-semibold truncate">{name}</div>
            {isOwner && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function InviteCodeCard({ code, onRegenerate }: { code: string; onRegenerate: () => void }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Codice invito</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono tracking-widest text-lg bg-muted rounded-md px-3 py-2 text-center">{code}</div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(code);
            toast.success("Codice copiato");
          }}
          aria-label="Copia codice"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={onRegenerate} aria-label="Rigenera codice">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Condividi questo codice con chi vuoi unire alla famiglia.</p>
    </Card>
  );
}

function MembersCard({
  members,
  currentUserId,
  ownerId,
  isOwner,
  onRemove,
}: {
  members: { user_id: string; display_name: string; email: string; role: string }[];
  currentUserId: string;
  ownerId: string;
  isOwner: boolean;
  onRemove: (userId: string) => void;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Membri ({members.length})</div>
      <ul className="divide-y divide-border">
        {members.map((m) => {
          const isMe = m.user_id === currentUserId;
          const isMemberOwner = m.user_id === ownerId;
          return (
            <li key={m.user_id} className="flex items-center gap-3 py-3">
              <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-semibold">
                {initials(m.display_name || m.email || "?")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {m.display_name || m.email || "Membro"}
                  {isMe && <Badge variant="secondary" className="text-[10px] h-5">Tu</Badge>}
                </div>
                {m.email && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
              </div>
              <Badge variant={isMemberOwner ? "default" : "outline"} className="text-[10px]">
                {isMemberOwner ? "Proprietario" : "Membro"}
              </Badge>
              {isOwner && !isMemberOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rimuovere {m.display_name || m.email}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Non avrà più accesso ai dati condivisi.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onRemove(m.user_id)}>Rimuovi</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InvitesCard({
  invites,
  onInvite,
  onRevoke,
}: {
  invites: { id: string; email: string; expires_at: string }[];
  onInvite: (email: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [email, setEmail] = useState("");
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Inviti</div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          placeholder="email@esempio.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full"
        />
        <Button
          className="w-full sm:w-auto shrink-0 whitespace-nowrap btn-touch"
          onClick={() => {
            if (!email.trim()) return;
            onInvite(email);
            setEmail("");
          }}
        >
          <Mail className="h-4 w-4 mr-1.5" /> Invita
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        L'invitato dovrà unirsi usando il codice famiglia o accettando l'invito al login.
      </p>
      {invites.length > 0 && (
        <ul className="divide-y divide-border">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{inv.email}</div>
                <div className="text-[11px] text-muted-foreground">
                  scade il {new Date(inv.expires_at).toLocaleDateString("it-IT")}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onRevoke(inv.id)}>
                Revoca
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DangerZone({ familyName, onDelete }: { familyName: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  return (
    <Card className="p-4 space-y-3 border-destructive/40">
      <div className="text-sm font-medium text-destructive">Zona pericolosa</div>
      <p className="text-xs text-muted-foreground">
        Eliminando la famiglia, tutti i membri perderanno l'accesso condiviso. L'azione è irreversibile.
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <Trash2 className="h-4 w-4 mr-2" /> Elimina famiglia
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Digita il nome della famiglia (<span className="font-mono">{familyName}</span>) per confermare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={familyName}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm("")}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirm !== familyName}
              onClick={() => {
                onDelete();
                setConfirm("");
                setOpen(false);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ReceivedInvites({
  invites,
  onAccept,
  onDecline,
}: {
  invites: (FamilyInvite & { families: { name: string } | null })[];
  onAccept: (inv: FamilyInvite) => Promise<unknown>;
  onDecline: (id: string) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<{ id: string; action: "accept" | "decline" } | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const visible = invites.filter((inv) => !removedIds.includes(inv.id));
  if (visible.length === 0) return null;

  return (
    <Card className="p-4 space-y-3 border-l-4 border-l-primary">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center">
          <Bell className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium">Inviti ricevuti</div>
      </div>
      <ul className="space-y-3">
        {visible.map((inv) => (
          <li key={inv.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                Ti hanno invitato in <span className="text-primary">{inv.families?.name ?? "una famiglia"}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Scade il {new Date(inv.expires_at).toLocaleDateString("it-IT")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setBusy({ id: inv.id, action: "decline" });
                  onDecline(inv.id)
                    .then(() => {
                      setRemovedIds((prev) => [...prev, inv.id]);
                      setBusy(null);
                    })
                    .catch(() => setBusy(null));
                }}
              >
                {busy?.id === inv.id && busy.action === "decline" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <X className="h-3.5 w-3.5 mr-1" />
                )}
                Rifiuta
              </Button>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setBusy({ id: inv.id, action: "accept" });
                  onAccept(inv)
                    .then(() => {
                      setRemovedIds((prev) => [...prev, inv.id]);
                      setBusy(null);
                    })
                    .catch(() => setBusy(null));
                }}
              >
                {busy?.id === inv.id && busy.action === "accept" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Check className="h-3.5 w-3.5 mr-1" />
                )}
                Accetta
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}