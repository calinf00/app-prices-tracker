## Obiettivo

Permettere all'utente di caricare (e sostituire/rimuovere) una foto descrittiva per ogni prodotto dalla pagina **Dettaglio prodotto**. La foto verrà mostrata nell'header del dettaglio (al posto dell'icona categoria) e nelle liste che già usano `image_url`.

## Stato attuale

- La tabella `products` ha già la colonna `image_url` (nullable, text).
- Il dettaglio prodotto (`src/routes/_authenticated/products.$id.tsx`) **legge** già `image_url` e la mostra nell'avatar in alto.
- Manca: UI per caricare/cambiare/rimuovere la foto e lo storage bucket dove salvare i file.

## Cosa fare

### 1. Storage bucket

Creare un bucket pubblico `product-images` su Lovable Cloud con policy RLS su `storage.objects`:
- SELECT pubblico (chiunque può vedere le foto: servono nelle liste).
- INSERT / UPDATE / DELETE solo per `authenticated` e solo sui file nel proprio "folder" (`{user_id}/...`), così ogni utente gestisce solo le proprie immagini.

### 2. UI nel dettaglio prodotto

Nella card header del prodotto (riga con icona + nome):
- Se non c'è foto: l'icona categoria attuale resta visibile, ma diventa cliccabile e mostra al hover/tap un overlay "Aggiungi foto" che apre il file picker.
- Se c'è foto: la foto è mostrata come oggi; al hover/tap appare un piccolo menu con **Cambia foto** e **Rimuovi foto**.
- Mostrare uno spinner sull'avatar durante l'upload.
- Compressione lato client riusando `src/lib/image-compress.ts` (max ~1200px, JPEG q≈0.85) per limitare la dimensione.
- Toast di successo / errore via `toUserMessage`.

### 3. Flusso di upload

1. Comprimi l'immagine.
2. Upload su `product-images/{user_id}/{product_id}-{timestamp}.jpg` con `upsert: true`.
3. Recupera la `publicUrl` e fai `update` su `products.image_url`.
4. Se l'aggiornamento del record va a buon fine e c'era una foto precedente caricata da noi (path che inizia con `{user_id}/`), elimina il vecchio file dal bucket per non accumulare orfani.
5. Invalida `["product", id]` e `["products-with-purchases"]`.

### 4. Rimozione foto

- `update products set image_url = null` + delete del file dal bucket (se appartiene all'utente).

## Dettagli tecnici

**File toccati**
- `supabase/migrations/<timestamp>_product_images_bucket.sql` — policy RLS su `storage.objects` per il bucket (il bucket si crea via tool).
- `src/routes/_authenticated/products.$id.tsx` — header avatar interattivo + nuova mutation `uploadImage` / `removeImage`. Niente modifiche al `ProductEditDialog` (lo gestisco direttamente nell'header, è più immediato).

**Pattern RLS storage.objects (esempio)**
```text
bucket_id = 'product-images'
AND (storage.foldername(name))[1] = auth.uid()::text
```

**Niente di rotto**: la UI esistente continua a funzionare perché il rendering condizionale su `image_url` è già presente. Nessuna modifica allo schema DB.

## Domande aperte (assunzioni se non rispondi)

- Bucket pubblico (foto visibili senza auth) → assunto **sì**, così le foto compaiono in tutte le liste senza signed URL.
- Una sola foto per prodotto (non galleria) → assunto **sì**.

Se vuoi galleria multi-foto o bucket privato con signed URL, dimmelo e rivedo il piano.