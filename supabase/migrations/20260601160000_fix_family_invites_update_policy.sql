-- Fix: family_invites UPDATE/DELETE policies referenced auth.users which the
-- authenticated role cannot SELECT, causing 42501 "permission denied for table users".
-- Use auth.jwt() claim instead.

DROP POLICY IF EXISTS "family_invites_update" ON public.family_invites;
CREATE POLICY "family_invites_update" ON public.family_invites
FOR UPDATE TO authenticated
USING (
  invited_by = auth.uid()
  OR public.is_family_owner(family_id, auth.uid())
  OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
WITH CHECK (
  invited_by = auth.uid()
  OR public.is_family_owner(family_id, auth.uid())
  OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

DROP POLICY IF EXISTS "family_invites_delete" ON public.family_invites;
CREATE POLICY "family_invites_delete" ON public.family_invites
FOR DELETE TO authenticated
USING (
  invited_by = auth.uid()
  OR public.is_family_owner(family_id, auth.uid())
);
