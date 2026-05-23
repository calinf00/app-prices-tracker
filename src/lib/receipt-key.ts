// Encode a (store_name, purchase_date) pair into a URL-safe key, and back.
// store_name may be null/empty.

const SEP = "\u0001";

const toBase64Url = (s: string) =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
};

export function encodeReceiptKey(store: string | null, date: string): string {
  return toBase64Url(`${store ?? ""}${SEP}${date}`);
}

export function decodeReceiptKey(key: string): { store: string | null; date: string } {
  // Backward-compat: if it looks like a UUID, treat as legacy group id (caller handles)
  try {
    const raw = fromBase64Url(key);
    const [s, d] = raw.split(SEP);
    return { store: s ? s : null, date: d ?? "" };
  } catch {
    return { store: null, date: "" };
  }
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
