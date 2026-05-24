import { Link, useLocation } from "@tanstack/react-router";
import { Home, Camera, Package, ShoppingCart, Users, Settings, X, Bot } from "lucide-react";
import type { ReactNode } from "react";
import { useFamily } from "@/hooks/use-family";
import { useInviteCount } from "@/hooks/use-invite-count";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/user-errors";

type Tab = { to: string; label: string; icon: typeof Home; exact?: boolean };
const tabs: Tab[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/scan", label: "Scansiona", icon: Camera },
  { to: "/products", label: "Prodotti", icon: Package },
  { to: "/shopping-list", label: "Lista", icon: ShoppingCart },
  { to: "/assistant", label: "Assistente", icon: Bot },
];

const titles: Record<string, string> = {
  "/": "Home",
  "/scan": "Scansiona",
  "/products": "Prodotti",
  "/shopping-list": "Lista Spesa",
  "/assistant": "Assistente AI",
  "/settings": "Impostazioni",
  "/family": "Famiglia",
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const title =
    titles[pathname] ??
    (pathname.startsWith("/products/") ? "Dettaglio prodotto" : "App Prezzi");

  const inviteCount = useInviteCount();
  const family = useFamily();
  const pendingInvite = family.myInvites?.[0] as
    | (typeof family.myInvites)[number]
    | undefined;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-[640px] items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-1">
            <Link
              to="/family"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors relative"
              aria-label="Famiglia"
            >
              <Users className="h-5 w-5" />
              {inviteCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-background">
                  {inviteCount > 9 ? "9+" : inviteCount}
                </span>
              )}
            </Link>
            <Link
              to="/settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Impostazioni"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
        {pendingInvite && (
          <div className="mx-auto w-full max-w-[640px] px-4 pb-2">
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <Users className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0 truncate">
                Invito a unirti a "{pendingInvite.families?.name ?? "una famiglia"}"
              </div>
              <Button
                size="sm"
                onClick={() =>
                  family
                    .acceptInvite(pendingInvite)
                    .then(() => toast.success("Invito accettato"))
                    .catch((e) => toast.error(toUserMessage(e as Error)))
                }
              >
                Accetta
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  family
                    .declineInvite(pendingInvite.id)
                    .then(() => toast.success("Invito rifiutato"))
                    .catch((e) => toast.error(toUserMessage(e as Error)))
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </header>

      <main
        key={pathname}
        className="flex-1 mx-auto w-full max-w-[640px] px-4 py-4 pb-[calc(60px+env(safe-area-inset-bottom)+16px)] animate-fade-in"
      >
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[640px] items-stretch justify-around h-[60px] px-1">
          {tabs.map(({ to, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === to
              : pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to as "/"}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-transform duration-100 active:scale-95 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute top-1 h-1 w-6 rounded-full bg-primary" />
                )}
                <span className="relative">
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.2]" : ""}`} />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}