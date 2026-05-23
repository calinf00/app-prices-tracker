import { useEffect, useState } from "react";
import { X, Share } from "lucide-react";

const STORAGE_KEY = "ios-install-hint-dismissed";

export function IosInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari
      window.navigator.standalone === true;
    const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    const inIframe = window.self !== window.top;
    if (isIOS && !isStandalone && !dismissed && !inIframe) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/15 p-2 text-primary">
          <Share className="h-5 w-5" />
        </div>
        <div className="flex-1 text-sm text-foreground">
          Per aggiungere alla Home: tocca <span className="font-semibold">Condividi</span> →{" "}
          <span className="font-semibold">Aggiungi a schermata Home</span>.
        </div>
        <button
          aria-label="Chiudi"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setVisible(false);
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}