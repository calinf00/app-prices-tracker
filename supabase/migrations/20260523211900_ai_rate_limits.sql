-- Per-user rate limiting for OpenAI-backed server functions.
create table if not exists public.ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fn_name text not null,
  called_at timestamptz not null default now()
);

create index if not exists ai_rate_limits_user_fn_time_idx
  on public.ai_rate_limits (user_id, fn_name, called_at desc);

alter table public.ai_rate_limits enable row level security;

drop policy if exists "ai_rate_limits_select_own" on public.ai_rate_limits;
create policy "ai_rate_limits_select_own" on public.ai_rate_limits
  for select using (auth.uid() = user_id);

drop policy if exists "ai_rate_limits_insert_own" on public.ai_rate_limits;
create policy "ai_rate_limits_insert_own" on public.ai_rate_limits
  for insert with check (auth.uid() = user_id);
