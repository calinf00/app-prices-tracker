-- Harden family RLS policies: remove every old recursive policy and recreate
-- them using SECURITY DEFINER helpers that bypass row-level security.

CREATE OR REPLACE FUNCTION public.is_family_member(_family_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members
    WHERE family_id = _family_id
      AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_owner(_family_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.families
    WHERE id = _family_id
      AND created_by = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_same_family_user(_other_user_id uuid, _current_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members mine
    JOIN public.family_members other_member
      ON other_member.family_id = mine.family_id
    WHERE mine.user_id = _current_user_id
      AND other_member.user_id = _other_user_id
  );
$$;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('families', 'family_members', 'family_invites')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "families_select" ON public.families
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_family_member(id, auth.uid())
);

CREATE POLICY "families_insert" ON public.families
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "families_update" ON public.families
FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "families_delete" ON public.families
FOR DELETE TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "family_members_select" ON public.family_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_family_member(family_id, auth.uid())
  OR public.is_family_owner(family_id, auth.uid())
);

CREATE POLICY "family_members_insert" ON public.family_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_family_owner(family_id, auth.uid())
);

CREATE POLICY "family_members_delete" ON public.family_members
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_family_owner(family_id, auth.uid())
);

CREATE POLICY "family_invites_select" ON public.family_invites
FOR SELECT TO authenticated
USING (
  invited_by = auth.uid()
  OR public.is_family_member(family_id, auth.uid())
  OR public.is_family_owner(family_id, auth.uid())
);

CREATE POLICY "family_invites_insert" ON public.family_invites
FOR INSERT TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND public.is_family_owner(family_id, auth.uid())
);

CREATE POLICY "family_invites_update" ON public.family_invites
FOR UPDATE TO authenticated
USING (
  invited_by = auth.uid()
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
)
WITH CHECK (
  invited_by = auth.uid()
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "family_invites_delete" ON public.family_invites
FOR DELETE TO authenticated
USING (invited_by = auth.uid() OR public.is_family_owner(family_id, auth.uid()));

DROP POLICY IF EXISTS "products_select_family" ON public.products;
CREATE POLICY "products_select_family" ON public.products
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_same_family_user(user_id, auth.uid())
);

DROP POLICY IF EXISTS "purchases_select_family" ON public.purchases;
CREATE POLICY "purchases_select_family" ON public.purchases
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_same_family_user(user_id, auth.uid())
);

DROP POLICY IF EXISTS "shopping_list_select_family" ON public.shopping_list;
CREATE POLICY "shopping_list_select_family" ON public.shopping_list
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR assigned_to = auth.uid()
  OR public.is_same_family_user(user_id, auth.uid())
  OR public.is_same_family_user(assigned_to, auth.uid())
);
