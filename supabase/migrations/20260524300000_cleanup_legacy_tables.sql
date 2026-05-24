-- Archive and disable legacy tables not used by the app.
-- We do NOT drop them yet to avoid accidental data loss.
-- Instead: enable RLS on them and block all access.

ALTER TABLE IF EXISTS public.prodotti ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prezzi ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.categorie ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fornitori ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.storico_prezzi ENABLE ROW LEVEL SECURITY;

-- Block all access (no policy = deny all in Supabase with RLS enabled)
-- Add a comment to mark them as legacy
COMMENT ON TABLE public.prodotti IS 'LEGACY - non usata dall app attiva. Vedere tabella products.';
COMMENT ON TABLE public.prezzi IS 'LEGACY - non usata dall app attiva. Vedere tabella purchases.';
COMMENT ON TABLE public.categorie IS 'LEGACY - non usata dall app attiva.';
COMMENT ON TABLE public.fornitori IS 'LEGACY - non usata dall app attiva.';
COMMENT ON TABLE public.storico_prezzi IS 'LEGACY - non usata dall app attiva.';

-- Fix user_id nullable issue on active tables
-- First check and fix NULL records by making them visible only when user_id matches
-- These UPDATE statements only run if there is exactly one user in the system (safe migration)
DO $$
DECLARE
  single_user_id uuid;
  user_count int;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users;

  IF user_count = 1 THEN
    SELECT id INTO single_user_id FROM auth.users LIMIT 1;

    UPDATE public.products SET user_id = single_user_id WHERE user_id IS NULL;
    UPDATE public.purchases SET user_id = single_user_id WHERE user_id IS NULL;
    UPDATE public.shopping_list SET user_id = single_user_id WHERE user_id IS NULL;

    RAISE NOTICE 'Backfill completato: tutti i record NULL assegnati all utente %', single_user_id;
  ELSIF user_count > 1 THEN
    RAISE NOTICE 'Più utenti trovati (%). I record con user_id NULL rimarranno nascosti (non assegnati). Verificare manualmente.', user_count;
  END IF;
END $$;
