// Centralized helper to convert thrown errors into safe, user-facing
// messages. Raw Supabase / Postgres errors can leak schema or policy
// names; we log the full detail and return a generic message instead.

const SAFE_AUTH_FRAGMENTS = [
  "Invalid login credentials",
  "Email not confirmed",
  "User already registered",
  "Password should be at least",
  "Unable to validate email address",
  "Email rate limit exceeded",
  "Signups not allowed",
];

// Curated AI-flow messages that are safe (and helpful) to show users.
const SAFE_AI_MESSAGES = [
  "Errore di connessione all'AI",
  "L'AI non ha restituito un formato valido, riprova",
  "Immagine non leggibile, prova con una foto più nitida",
  "Nessun prodotto trovato nello scontrino",
];

export function toUserMessage(err: unknown, fallback = "Si è verificato un errore. Riprova."): string {
  // Always log the real error for debugging.
  // eslint-disable-next-line no-console
  console.error("[app error]", err);

  const raw = (err as { message?: unknown })?.message;
  if (typeof raw !== "string" || !raw) return fallback;

  // Allow a small allow-list of known-safe auth messages through so users
  // get actionable feedback on login/signup.
  if (SAFE_AUTH_FRAGMENTS.some((f) => raw.includes(f))) return raw;
  if (SAFE_AI_MESSAGES.some((m) => raw === m)) return raw;

  // Rate-limit / quota errors surfaced explicitly by server fns.
  if (raw.startsWith("Limite di utilizzo")) return raw;

  return fallback;
}