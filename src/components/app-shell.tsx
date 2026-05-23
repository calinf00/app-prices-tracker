import { Link, useLocation } from "@tanstack/react-router";
import { Home, Camera, Package, ShoppingCart, Bot, Settings } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/scan", label: "Scansiona", icon: Camera },
  { to: "/products", label: "Prodotti", icon: Package },
  { to: "/shopping-list", label: "Lista", icon: ShoppingCart },
  { to: "/assistant", label: "Assistente", icon: Bot },
] as const;

const titles: Record<string, string> = {
  "/": "Home",
  "/scan": "Scansiona",
  "/products": "Prodotti",
  "/shopping-list": "Lista Spesa",
  "/assistant": "Assistente",
  "/settings": "Impostazioni",
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const title =
    titles[pathname] ??
    (pathname.startsWith("/products/") ? "Dettaglio prodotto" : "App Prezzi");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-[640px] items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <Link
            to="/settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Impostazioni"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[640px] px-4 py-4 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[640px] items-stretch justify-around h-16 px-1">
          {tabs.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.2]" : ""}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}