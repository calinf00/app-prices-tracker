# Piano: App Prezzi (MVP)

Web app mobile-first per tracciare prezzi prodotti, gestire lista spesa e ricevere consigli da un assistente AI.

## Note tecniche importanti (da confermare prima di iniziare)

1. **Router**: il template di Lovable usa **TanStack Router** (file-based in `src/routes/`), non `react-router-dom`. Le funzionalità sono equivalenti (route, navigazione, guard auth). Procedo con TanStack Router — l'esperienza utente è identica.
2. **Supabase**: Lovable Cloud è già attivo e usa Supabase sotto. Le variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` sono già nel `.env`. Verifico che le 3 tabelle (`products`, `purchases`, `shopping_list`) esistano già nel DB; se mancano le creo con la struttura indicata.
3. **OpenAI**: verifico se `OPENAI_API_KEY` è già nei secret. Se manca, te la chiedo prima di iniziare (la useremo via server function — mai esposta al client).
4. **Tema scuro default**: aggiungo toggle dark/light in Impostazioni con persistenza in localStorage.

## Cosa costruisco

### 1. Autenticazione (Supabase Auth, email + password)
- Pagina `/auth` con tab "Accedi" / "Registrati", logo "App Prezzi", campo email + password.
- Layout protetto `_authenticated` che reindirizza a `/auth` se non loggato.
- Sessione persistente, listener `onAuthStateChange` per invalidare cache.
- Logout dalle Impostazioni.

### 2. Shell app + Bottom Navigation
- Layout con header (titolo pagina) e bottom nav fissa a 5 tab:
  1. Home (`/`)
  2. Scansiona (`/scan`)
  3. Prodotti (`/products`)
  4. Lista Spesa (`/shopping-list`)
  5. Assistente (`/assistant`)
- Icone Lucide, tab attiva evidenziata in verde smeraldo.
- Accesso Impostazioni dall'header (icona ingranaggio).

### 3. Schermate (MVP funzionale per ognuna)
- **Home**: panoramica — ultimi acquisti, totale spesa mese corrente, prodotto più economico recente, scorciatoie ai tab principali.
- **Scansiona**: input fotocamera (`<input capture>`) per scattare/caricare foto scontrino o barcode. Upload su Supabase Storage (bucket `receipts`), poi estrazione voci tramite **OpenAI gpt-4o vision** (server function). Risultati modificabili e salvabili in `purchases`.
- **Prodotti**: lista `products` con ricerca, filtro per categoria, immagine, ultimo prezzo noto. Dettaglio prodotto → storico `purchases` con grafico prezzo nel tempo (recharts) e prezzo medio per negozio.
- **Lista Spesa**: CRUD su `shopping_list`, checkbox "acquistato", quantità + unità, eventuale link a prodotto esistente. Pulsante "Svuota acquistati".
- **Assistente AI**: chat con gpt-4o che risponde a domande tipo "dove ho comprato la pasta più conveniente?" usando come contesto i dati dell'utente da `purchases`/`products`.

### 4. Impostazioni (`/settings`)
- Email utente, logout.
- Toggle tema scuro/chiaro.
- Link tornare alla home.

### 5. Design system
- Tailwind tokens semantici in `src/styles.css` (oklch): primario verde smeraldo (`#10b981`), background scuro #0a0a0a / superfici #141414, accenti, hover states.
- Tipografia: Inter o simile, gerarchia chiara (display, h1-h3, body, caption).
- Componenti shadcn: Button, Input, Card, Tabs, Dialog, Sheet, Toast (sonner).
- Mobile-first: max-width contenitore 480px su mobile, layout responsive per desktop.

## Dettagli tecnici (per riferimento)

- **Server functions**: tutte le chiamate OpenAI passano da `createServerFn` con middleware `requireSupabaseAuth` — la chiave non tocca mai il browser.
- **RLS**: verifico che le 3 tabelle abbiano RLS attiva con policy `auth.uid() = user_id`. **Importante**: le tabelle che hai indicato non hanno una colonna `user_id`. Per un'app multi-utente serve aggiungerla (migration) altrimenti tutti gli utenti vedono i dati di tutti. **Chiedimi conferma**: aggiungo `user_id uuid references auth.users` alle 3 tabelle?
- **Storage**: bucket privato `receipts` per le foto scontrini, policy basata su `auth.uid()`.
- **Routing**: TanStack Router file-based, layout `_authenticated` per le tab + route pubblica `/auth`.
- **State**: TanStack Query per fetch/cache, mutation con invalidazione.

## Ordine di implementazione

1. Setup auth (pagina login/registrazione + guard)
2. Shell + bottom nav + tema + Impostazioni con logout
3. Tab Prodotti (lettura + dettaglio + storico)
4. Tab Lista Spesa (CRUD)
5. Tab Home (aggregati)
6. Tab Scansiona (upload + OpenAI vision)
7. Tab Assistente (chat AI con contesto dati)

Testo ogni blocco prima di passare al successivo, come da regola del progetto.

## Conferme richieste prima di iniziare

1. Ok ad usare **TanStack Router** invece di `react-router-dom`?
2. Aggiungo la colonna `user_id` alle 3 tabelle per isolare i dati per utente?
3. Confermi che `OPENAI_API_KEY` è già nei secret? (se no la chiedo)
