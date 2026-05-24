-- Ensure shopping_list INSERT policy explicitly allows authenticated users
-- to insert rows for themselves. Recreate to be sure.
DROP POLICY IF EXISTS "shopping_list_insert_own" ON public.shopping_list;
CREATE POLICY "shopping_list_insert_own" ON public.shopping_list
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
