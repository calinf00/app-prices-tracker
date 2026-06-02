## Problema

Lo scanner segnala che `public.fill_family_member_info()` è una funzione `SECURITY DEFINER` esposta tramite `/rest/v1/rpc/...` ed eseguibile dal ruolo `anon` (utenti non autenticati). Questo è rischioso perché esegue con i privilegi del proprietario bypassando RLS.

La funzione non è presente nelle migrations del progetto (probabilmente creata manualmente nel SQL Editor o ereditata). Esistono però altre funzioni `SECURITY DEFINER` simili (`is_family_member`, `is_family_owner`, `my_family_ids`, `is_same_family_user`, `is_family_owned`, `set_user_id_from_auth`) che meritano la stessa protezione.

## Soluzione

Creare una nuova migration che **revoca `EXECUTE` dal ruolo `anon` e da `PUBLIC`** su tutte le funzioni `SECURITY DEFINER` interne, lasciando `EXECUTE` solo a `authenticated` (e `service_role`). Queste funzioni servono solo come helper per le policy RLS — non devono essere chiamate via REST.

Non convertiamo a `SECURITY INVOKER`: ci servono come `DEFINER` per evitare ricorsione infinita nelle policy RLS di `family_members` (vedi migration `20260601130000_fix_family_members_recursion.sql`).

## Migration

Nuovo file: `supabase/migrations/<timestamp>_lock_down_security_definer_functions.sql`

```sql
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
      -- skip functions that don't exist in this DB
      NULL;
    END;
  END LOOP;
END $$;
```

Il blocco `EXCEPTION` ignora silenziosamente le funzioni che non esistono, così la migration è sicura anche se `fill_family_member_info` fosse già stata rimossa o avesse una signature diversa.

## Verifica post-migration

Dopo l'applicazione, riavviare lo scan di sicurezza: il finding dovrebbe scomparire perché `anon` non potrà più chiamare la funzione via `/rest/v1/rpc/fill_family_member_info`.
