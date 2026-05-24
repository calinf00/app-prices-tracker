-- Drop ALL existing INSERT policies on shopping_list to clear any restrictive policy
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopping_list' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_list', p.policyname);
  END LOOP;
END $$;

-- Recreate a single clean permissive INSERT policy for authenticated users
CREATE POLICY "shopping_list_insert_own" ON public.shopping_list
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Ensure the BEFORE INSERT trigger that fills user_id from auth.uid() exists
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

DROP TRIGGER IF EXISTS set_user_id_shopping_list ON public.shopping_list;
CREATE TRIGGER set_user_id_shopping_list
  BEFORE INSERT ON public.shopping_list
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_from_auth();
