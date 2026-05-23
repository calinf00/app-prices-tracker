## Piano: setup App Prezzi con Supabase esterno

### ⚠️ Attenzione sicurezza
Hai incollato la **service_role key** in chat. È una chiave segreta con privilegi di amministratore (bypassa RLS). Dopo il setup ti consiglio di **ruotarla** dal pannello Supabase → Settings → API → "Reset service_role secret".

### Step 1 — Salvare le credenziali come secrets
Aggiungo nel progetto Lovable questi secrets (NON in chiaro nel codice):
- `SUPABASE_URL` = `https://kczefapyoyokmbnwhtgn.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = anon key (la #2)
- `SUPABASE_SERVICE_ROLE_KEY` = service_role (la #3)
- `VITE_SUPABASE_URL` = stesso URL (per il client browser)
- `VITE_SUPABASE_PUBLISHABLE_KEY` = anon key (per il client browser)

### Step 2 — Generare il client Supabase nel progetto
Creo i file:
- `src/integrations/supabase/client.ts` (client browser, anon key)
- `src/integrations/supabase/client.server.ts` (admin, service role)
- `src/integrations/supabase/auth-middleware.ts` (per server functions autenticate)
- `src/integrations/supabase/auth-attacher.ts` + registrazione in `src/start.ts`

### Step 3 — Schema del database
Dato che il DB è esterno (non gestito da Lovable Cloud), le migrazioni le applichi tu sul tuo progetto Supabase. Ti preparerò uno script SQL completo da incollare nel SQL Editor di Supabase con:

**Tabelle:**
- `categorie` (id, nome, descrizione, created_at)
- `fornitori` (id, nome, contatto_email, contatto_telefono, note, created_at)
- `prodotti` (id, codice, nome, descrizione, categoria_id, unita_misura, created_at)
- `prezzi` (id, prodotto_id, fornitori_id, prezzo, valuta default EUR, valido_dal, valido_al, note, created_at)
- `storico_prezzi` (id, prezzo_id, prezzo_vecchio, prezzo_nuovo, changed_at, changed_by) — popolata via trigger
- `user_roles` (id, user_id, role enum: admin/user) — pattern sicuro Lovable

**Sicurezza:**
- RLS abilitato su tutte le tabelle
- Funzione `has_role(uuid, app_role) SECURITY DEFINER`
- Policy: utenti autenticati possono leggere; solo admin possono scrivere
- Trigger su `prezzi` per popolare automaticamente `storico_prezzi` quando cambia il prezzo

### Step 4 — Verifica connessione
Test minimale: pagina che fa una query sulle `categorie` per confermare che il collegamento funziona.

---

### Cosa ti chiedo prima di partire
1. Confermi che procediamo a salvare i 3 secrets così come li hai inviati?
2. Vuoi che preparo io lo SQL e te lo passo da incollare nel SQL Editor del tuo Supabase, oppure preferisci che io tenti di applicare le migrazioni tramite la service_role (più rischioso, ma automatico)?
3. Confermi le tabelle elencate o ne vuoi aggiungere/togliere?
