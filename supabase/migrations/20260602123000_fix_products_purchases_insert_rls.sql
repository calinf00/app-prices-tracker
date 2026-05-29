-- Fix product/purchase creation from the authenticated app.
-- These tables are auth-only: no anon grants.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.purchases TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_id_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_user_id_products ON public.products;
CREATE TRIGGER set_user_id_products
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

DROP TRIGGER IF EXISTS set_user_id_purchases ON public.purchases;
CREATE TRIGGER set_user_id_purchases
  BEFORE INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();

DROP POLICY IF EXISTS "products_insert_own" ON public.products;
DROP POLICY IF EXISTS "purchases_insert_own" ON public.purchases;

CREATE POLICY "products_insert_own" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "purchases_insert_own" ON public.purchases
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
