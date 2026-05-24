-- Fix reinvites for family_invites
-- The app now revokes/accepts/declines invites by status instead of deleting them.
-- This removes the old strict family_id/email unique constraint and replaces it
-- with a partial unique index that only blocks multiple pending invites.

ALTER TABLE public.family_invites
  DROP CONSTRAINT IF EXISTS family_invites_family_id_email_key;

-- Keep email comparisons predictable for future inserts/updates.
UPDATE public.family_invites
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

-- If old data contains duplicate pending invites, keep only the latest one pending.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY family_id, lower(email)
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.family_invites
  WHERE status = 'pending'
)
UPDATE public.family_invites fi
SET status = 'revoked'
FROM ranked r
WHERE fi.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS family_invites_one_pending_per_email;
CREATE UNIQUE INDEX family_invites_one_pending_per_email
  ON public.family_invites (family_id, lower(email))
  WHERE status = 'pending';
