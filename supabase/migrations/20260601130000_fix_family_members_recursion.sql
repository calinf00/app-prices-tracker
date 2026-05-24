-- Fix infinite recursion in family_members RLS policies by using SECURITY DEFINER helpers

CREATE OR REPLACE FUNCTION public.is_family_member(_family_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_owner(_family_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.families WHERE id = _family_id AND created_by = _user_id
  );
$$;

-- families select: use helper to avoid referencing family_members inline (also safer)
DROP POLICY IF EXISTS "families_select" ON public.families;
CREATE POLICY "families_select" ON public.families FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_family_member(id, auth.uid()));

-- family_members policies rewritten with helpers
DROP POLICY IF EXISTS "family_members_select" ON public.family_members;
CREATE POLICY "family_members_select" ON public.family_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_family_member(family_id, auth.uid()));

DROP POLICY IF EXISTS "family_members_insert" ON public.family_members;
CREATE POLICY "family_members_insert" ON public.family_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_family_owner(family_id, auth.uid())
  );

DROP POLICY IF EXISTS "family_members_delete" ON public.family_members;
CREATE POLICY "family_members_delete" ON public.family_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_family_owner(family_id, auth.uid())
  );

-- family_invites select: use helper
DROP POLICY IF EXISTS "family_invites_select" ON public.family_invites;
CREATE POLICY "family_invites_select" ON public.family_invites FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR public.is_family_member(family_id, auth.uid())
  );
