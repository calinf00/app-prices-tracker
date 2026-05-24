-- Allow family members to UPDATE / DELETE shared products, purchases and shopping_list,
-- matching the family-aware SELECT policies.

-- Helper: check if the target row's owner shares a family with the current user
CREATE OR REPLACE FUNCTION public.is_family_owned(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _owner = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm1
      JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
        AND fm2.user_id = _owner
    );
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'purchases', 'shopping_list']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update_own" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete_own" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update_family" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete_family" ON public.%1$I', t);

    EXECUTE format(
      'CREATE POLICY "%1$s_update_family" ON public.%1$I
         FOR UPDATE TO authenticated
         USING (public.is_family_owned(user_id))
         WITH CHECK (public.is_family_owned(user_id))',
      t
    );
    EXECUTE format(
      'CREATE POLICY "%1$s_delete_family" ON public.%1$I
         FOR DELETE TO authenticated
         USING (public.is_family_owned(user_id))',
      t
    );
  END LOOP;
END $$;
