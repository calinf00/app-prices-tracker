import { Link, useLocation } from "@tanstack/react-router";
import { Home, Camera, Package, ShoppingCart, Users, Settings, X, Bot, Bell, Check } from "lucide-react";
import type { ReactNode } from "react";
import { useFamily } from "@/hooks/use-family";
import { useInviteCount } from "@/hooks/use-invite-count";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  "/notifications": "Notifiche",
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const title =
    titles[pathname] ??
    (pathname.startsWith("/products/") ? "Dettaglio prodotto" : "App Prezzi");

  const inviteCount = useInviteCount();
  const family = useFamily();
  const invites = family.myInvites ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-[640px] items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150 relative"
                  aria-label="Notifiche"
                >
                  <Bell className="h-5 w-5" />
                  {inviteCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-background">
                      {inviteCount > 9 ? "9+" : inviteCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <div className="font-medium text-sm">Notifiche</div>
                  <Link
                    to="/notifications"
                    className="text-xs text-primary hover:underline"
                  >
                    Vedi tutte
                  </Link>
                </div>
                {invites.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Nessuna notifica
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y">
                    {invites.slice(0, 5).map((inv) => (
                      <div key={inv.id} className="p-3">
                        <div className="flex items-start gap-2">
                          <Users className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">
                              Invito a "{inv.families?.name ?? "una famiglia"}"
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="h-7 px-2"
                                onClick={() =>
                                  family
                                    .acceptInvite(inv)
                                    .then(() => toast.success("Invito accettato"))
                                    .catch((e) => toast.error(toUserMessage(e as Error)))
                                }
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Accetta
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() =>
                                  family
                                    .declineInvite(inv.id)
                                    .then(() => toast.success("Invito rifiutato"))
                                    .catch((e) => toast.error(toUserMessage(e as Error)))
                                }
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Link
              to="/family"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150 relative"
              aria-label="Famiglia"
            >
              <Users className="h-5 w-5" />
            </Link>
            <Link
              to="/settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
              aria-label="Impostazioni"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
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