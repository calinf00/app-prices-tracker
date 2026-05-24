-- Harden RLS on public.family_invites
-- - SELECT: invitee (by email), inviter, or family owner
-- - INSERT: only when invited_by = auth.uid() and inviter is a member of the family
-- - UPDATE (accept/decline): invitee on their own email
-- - UPDATE (revoke): family owner or original inviter
-- - No DELETE: use status = 'revoked' instead

ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'family_invites'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.family_invites', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "family_invites_select_invitee_or_manager"
ON public.family_invites
FOR SELECT
TO authenticated
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
  OR invited_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.families f
    WHERE f.id = family_invites.family_id
      AND f.created_by = auth.uid()
  )
);

CREATE POLICY "family_invites_insert_self"
ON public.family_invites
FOR INSERT
TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = family_invites.family_id
      AND fm.user_id = auth.uid()
  )
);

CREATE POLICY "family_invites_update_invitee_or_manager"
ON public.family_invites
FOR UPDATE
TO authenticated
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
  OR invited_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.families f
    WHERE f.id = family_invites.family_id
      AND f.created_by = auth.uid()
  )
)
WITH CHECK (
  lower(email) = lower(auth.jwt() ->> 'email')
  OR invited_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.families f
    WHERE f.id = family_invites.family_id
      AND f.created_by = auth.uid()
  )
);

-- Intentionally NO DELETE policy: use status = 'revoked'
