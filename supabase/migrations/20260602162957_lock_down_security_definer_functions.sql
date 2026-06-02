-- Revoke public execution on internal SECURITY DEFINER helpers.
-- These exist only as RLS helpers and must NOT be callable via PostgREST RPC by anon.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fill_family_member_info()',
    'public.my_family_ids()',
    'public.is_family_member(uuid, uuid)',
    'public.is_family_owner(uuid, uuid)',
    'public.is_same_family_user(uuid, uuid)',
    'public.is_family_owned(uuid)',
    'public.set_user_id_from_auth()'
  ]
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;
