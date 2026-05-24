-- Replace family-aware SELECT policies with properly isolated versions.
-- The earlier policies allowed rows with NULL user_id to leak across accounts.

DROP POLICY IF EXISTS "products_select_own" ON public.products;
DROP POLICY IF EXISTS "products_select_family" ON public.products;
CREATE POLICY "products_select_isolated" ON public.products
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (
    user_id IS NOT NULL
    AND user_id IN (
      SELECT fm2.user_id
      FROM public.family_members fm1
      INNER JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
        AND fm2.user_id != auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "purchases_select_own" ON public.purchases;
DROP POLICY IF EXISTS "purchases_select_family" ON public.purchases;
CREATE POLICY "purchases_select_isolated" ON public.purchases
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (
    user_id IS NOT NULL
    AND user_id IN (
      SELECT fm2.user_id
      FROM public.family_members fm1
      INNER JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
        AND fm2.user_id != auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "shopping_list_select_own" ON public.shopping_list;
DROP POLICY IF EXISTS "shopping_list_select_family" ON public.shopping_list;
CREATE POLICY "shopping_list_select_isolated" ON public.shopping_list
FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (
    user_id IS NOT NULL
    AND user_id IN (
      SELECT fm2.user_id
      FROM public.family_members fm1
      INNER JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
        AND fm2.user_id != auth.uid()
    )
  )
);
