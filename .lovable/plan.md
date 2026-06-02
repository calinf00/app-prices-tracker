# Cerca foto del prodotto su internet con IA

## Obiettivo
Aggiungere un terzo tasto "Cerca con IA" accanto a Carica/Rimuovi nella pagina dettaglio prodotto. Quando premuto, il sistema cerca su internet una foto reale del prodotto in base a nome + brand + categoria, la scarica e la imposta come immagine del prodotto.

## Approccio
Usiamo **Firecrawl** (connettore Lovable) per:
1. Fare una `search` web della query "<brand> <nome prodotto> <categoria> product photo" con `scrapeOptions` per estrarre immagini.
2. Selezionare la prima immagine valida tra i risultati (filtrando per dimensione/formato).
3. Scaricarla lato server, caricarla nel bucket `product-images` di Storage (cartella utente), aggiornare `products.image_url`.

In alternativa, se la ricerca non restituisce risultati utili, l'IA (Lovable AI Gateway con `google/gemini-3-flash-preview`) può ri-formulare la query e ritentare una volta. Niente generazione di immagini sintetiche — l'utente ha chiesto foto reali dal web.

## Setup richiesto
- Collegare il connettore **Firecrawl** alla workspace (tool `standard_connectors--connect`). L'utente verrà invitato a fare login/creare l'account.
- `LOVABLE_API_KEY` (già presente per il gateway).

## File da modificare/creare

### 1. Nuovo: `src/lib/product-image-search.functions.ts`
Server function `findProductImageFn`:
- Input: `{ productId: string }`
- Carica il prodotto (con auth middleware), costruisce la query
- Chiama Firecrawl search via gateway (`https://connector-gateway.lovable.dev/firecrawl/v2/search`)
- (Opzionale) chiede al Lovable AI Gateway di scegliere il miglior URL tra i top 5 risultati
- `fetch()` dell'immagine, controlla `content-type` (image/jpeg|png|webp) e dimensione < 5MB
- Upload nel bucket `product-images` come `${userId}/${productId}-ai-${ts}.jpg` (usando il client autenticato così le RLS passano)
- `UPDATE products SET image_url = <publicUrl> WHERE id = ...`
- Ritorna `{ imageUrl }`

### 2. `src/routes/_authenticated/products.$id.tsx`
- Aggiungere import del nuovo server fn + icona (`Sparkles` da lucide-react)
- Aggiungere stato `searchingImage`
- Handler `searchWithAI()` che invoca `findProductImageFn`, mostra toast successo/errore, e fa `queryClient.invalidateQueries` per ricaricare i dati prodotto
- Aggiungere terzo `Button` "Cerca con IA" accanto al tasto "Rimuovi foto" (visibile sempre, disabilitato durante operazioni)

### 3. Layout tasti
Riorganizzare la riga azioni foto in un piccolo gruppo `flex gap-2 flex-wrap`:
- 📷 Carica (già esistente, sull'avatar)
- ✨ Cerca con IA (nuovo)
- 🗑 Rimuovi (esistente, solo se `image_url` presente)

## Gestione errori
- Firecrawl 402 (crediti finiti) → toast "Crediti Firecrawl esauriti, ricarica nella workspace"
- Nessuna immagine trovata → toast "Nessuna foto trovata, prova a caricare manualmente"
- Errore download/upload → toast con messaggio chiaro

## Non incluso
- Scelta tra più candidati (verrà presa la prima immagine valida; possibile miglioramento futuro con modale di scelta)
- Generazione AI di immagini sintetiche (esplicitamente esclusa)
- Cache risultati: ogni click rifa la ricerca

## Conferme necessarie
Procedo con la connessione Firecrawl in fase di build?