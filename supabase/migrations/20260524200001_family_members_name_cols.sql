-- Add display_name and email columns to family_members for client-side storage
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS email text;
