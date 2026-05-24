-- ============================================================
-- FAMILY GROUPS SYSTEM
-- ============================================================

-- 1. families table
CREATE TABLE IF NOT EXISTS public.families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'La mia famiglia',
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text UNIQUE NOT NULL DEFAULT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at  timestamptz DEFAULT now()
);

-- 2. family_members table
CREATE TABLE IF NOT EXISTS public.family_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at  timestamptz DEFAULT now(),
  UNIQUE(family_id, user_id)
);

-- 3. family_invites table (tracks pending invitations by email)
CREATE TABLE IF NOT EXISTS public.family_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  invited_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE(family_id, email)
);

-- 4. RLS
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

-- families: visible to members
CREATE POLICY "families_select" ON public.families FOR SELECT TO authenticated
  USING (id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid()));

CREATE POLICY "families_insert" ON public.families FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "families_update" ON public.families FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "families_delete" ON public.families FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- family_members: members can see siblings; owner can insert/delete
CREATE POLICY "family_members_select" ON public.family_members FOR SELECT TO authenticated
  USING (family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid()));

CREATE POLICY "family_members_insert" ON public.family_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()  -- self-join via invite code
    OR family_id IN (SELECT id FROM public.families WHERE created_by = auth.uid())  -- owner adds
  );

CREATE POLICY "family_members_delete" ON public.family_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()  -- leave by self
    OR family_id IN (SELECT id FROM public.families WHERE created_by = auth.uid())  -- owner removes
  );

-- family_invites: visible to owner and invited user
CREATE POLICY "family_invites_select" ON public.family_invites FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR family_id IN (SELECT family_id FROM public.family_members WHERE user_id = auth.uid())
  );

CREATE POLICY "family_invites_insert" ON public.family_invites FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid());

CREATE POLICY "family_invites_update" ON public.family_invites FOR UPDATE TO authenticated
  USING (invited_by = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "family_invites_delete" ON public.family_invites FOR DELETE TO authenticated
  USING (invited_by = auth.uid());

-- 5. Extend RLS on products, purchases, shopping_list to allow family members access

-- Drop old single-user select policies and replace with family-aware ones
DROP POLICY IF EXISTS "products_select_own" ON public.products;
CREATE POLICY "products_select_family" ON public.products FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT fm2.user_id FROM public.family_members fm1
      JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "purchases_select_own" ON public.purchases;
CREATE POLICY "purchases_select_family" ON public.purchases FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT fm2.user_id FROM public.family_members fm1
      JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "shopping_list_select_own" ON public.shopping_list;
CREATE POLICY "shopping_list_select_family" ON public.shopping_list FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT fm2.user_id FROM public.family_members fm1
      JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
      WHERE fm1.user_id = auth.uid()
    )
  );

-- 6. Helper function: get family_ids for current user
CREATE OR REPLACE FUNCTION public.my_family_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT family_id FROM public.family_members WHERE user_id = auth.uid();
$$;
