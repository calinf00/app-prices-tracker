## Piano

1. **Aggiorna `.env`** — sostituisci `VITE_SUPABASE_PUBLISHABLE_KEY` con la nuova chiave fornita dall'utente: `sb_publishable_ogCbcyFapj5Z_kRstYClTg_B8lXwzkr`.
2. **Verifica build** — esegui un controllo rapido per assicurarti che il progetto compili senza errori.

La chiave viene utilizzata in due punti:
- `src/integrations/supabase/client.ts` (browser client, via `import.meta.env`)
- `src/integrations/supabase/auth-middleware.ts` (server-side auth middleware, via `process.env`)

Nessun'altra modifica necessaria.