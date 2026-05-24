-- Product deduplication tables and soft-merge column

alter table public.products
  add column if not exists merged_into uuid references public.products(id) on delete set null;

create index if not exists products_merged_into_idx on public.products(merged_into);

create table if not exists public.product_merge_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  canonical_product_id uuid not null,
  merged_product_id uuid not null,
  created_at timestamptz default now(),
  unique(user_id, merged_product_id)
);

create table if not exists public.product_dedup_dismissed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  product_id_a uuid not null,
  product_id_b uuid not null,
  created_at timestamptz default now(),
  unique(user_id, product_id_a, product_id_b)
);

alter table public.product_merge_map enable row level security;
alter table public.product_dedup_dismissed enable row level security;

drop policy if exists "product_merge_map_all_own" on public.product_merge_map;
create policy "product_merge_map_all_own"
  on public.product_merge_map for all to authenticated
  using (user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "product_dedup_dismissed_all_own" on public.product_dedup_dismissed;
create policy "product_dedup_dismissed_all_own"
  on public.product_dedup_dismissed for all to authenticated
  using (user_id = auth.uid())
  with check (user_id is null or user_id = auth.uid());

drop trigger if exists set_user_id_product_merge_map on public.product_merge_map;
create trigger set_user_id_product_merge_map
before insert on public.product_merge_map
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_product_dedup_dismissed on public.product_dedup_dismissed;
create trigger set_user_id_product_dedup_dismissed
before insert on public.product_dedup_dismissed
for each row execute function public.set_user_id_from_auth();
