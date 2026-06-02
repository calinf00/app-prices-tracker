## Problema 1 — Errore caricamento foto

Il log mostra `StorageApiError: new row violates row-level security policy` quando si carica una foto sul bucket `product-images`. Cause possibili:

1. La migration `20260602161405_product_images_bucket.sql` (che crea il bucket e le policy RLS su `storage.objects`) **non è ancora stata applicata** al database di produzione (creata via file ma mai pushata).
2. Oppure il bucket esiste ma le policy non sono state create.

Il codice client è corretto: carica su `${uid}/${id}-${ts}.jpg`, e la policy richiede `auth.uid()::text = (storage.foldername(name))[1]` → combacia.

### Cosa fare
- Chiederti di applicare la migration `20260602161405_product_images_bucket.sql` su Supabase (SQL Editor o `supabase db push`).
- Se il bucket esiste già ma senza policy, lo script è idempotente sul bucket (`on conflict do nothing`) ma le `create policy` falliranno se già presenti. In quel caso creiamo una nuova migration che usa `drop policy if exists` prima di ricrearle, per garantire l'allineamento.

## Problema 2 — Pulsante "Rimuovi foto"

In realtà nel codice esiste già: `src/routes/_authenticated/products.$id.tsx` riga 333-342 mostra un pulsante testuale "✕ Rimuovi foto" sotto al nome del prodotto, visibile solo quando `image_url` è presente. È poco visibile (testo grigio piccolo 11px).

### Cosa fare
Rendere il pulsante più evidente:
- Sostituire il piccolo link testuale con un vero `Button` `variant="ghost"` `size="sm"` con icona cestino + label "Rimuovi foto", colore `text-destructive`.
- Confermare l'azione con un `AlertDialog` (Sei sicuro di voler rimuovere la foto?) per evitare cancellazioni accidentali.

## File toccati
- `src/routes/_authenticated/products.$id.tsx` — sostituire il bottone rimuovi con versione più visibile + dialog di conferma.
- (Eventuale) nuova migration `supabase/migrations/<ts>_product_images_policies_idempotent.sql` solo se confermi che la migration precedente è stata già applicata parzialmente.

## Domanda
Hai già applicato la migration `20260602161405_product_images_bucket.sql` su Supabase? (Senza quella, l'upload non può funzionare.)
