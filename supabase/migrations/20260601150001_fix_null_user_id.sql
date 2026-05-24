-- Fix records with NULL user_id that were visible across accounts.
-- The new SELECT policies (20260601150000) already hide NULL rows.
-- This migration tries to enforce NOT NULL going forward, but only if
-- there are no existing NULL rows. Otherwise it logs a warning and
-- leaves the columns nullable so the migration can still run safely.

DO $$
DECLARE
  p_count int;
  pu_count int;
  sl_count int;
BEGIN
  SELECT count(*) INTO p_count FROM public.products WHERE user_id IS NULL;
  SELECT count(*) INTO pu_count FROM public.purchases WHERE user_id IS NULL;
  SELECT count(*) INTO sl_count FROM public.shopping_list WHERE user_id IS NULL;

  IF p_count > 0 OR pu_count > 0 OR sl_count > 0 THEN
    RAISE NOTICE 'Records con user_id NULL trovati: products=%, purchases=%, shopping_list=%. Le colonne resteranno nullable finché questi record non vengono riassegnati o eliminati.', p_count, pu_count, sl_count;
  END IF;

  BEGIN
    IF p_count = 0 THEN
      ALTER TABLE public.products ALTER COLUMN user_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Impossibile impostare products.user_id NOT NULL: %', SQLERRM;
  END;

  BEGIN
    IF pu_count = 0 THEN
      ALTER TABLE public.purchases ALTER COLUMN user_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Impossibile impostare purchases.user_id NOT NULL: %', SQLERRM;
  END;

  BEGIN
    IF sl_count = 0 THEN
      ALTER TABLE public.shopping_list ALTER COLUMN user_id SET NOT NULL;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Impossibile impostare shopping_list.user_id NOT NULL: %', SQLERRM;
  END;
END $$;
