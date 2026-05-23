-- Add user_id to core tables, auto-populate via trigger, and enforce RLS.

-- 1. Add user_id columns
alter table public.products
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.purchases
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.shopping_list
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Trigger function that defaults user_id to the current auth user
create or replace function public.set_user_id_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- 3. Attach trigger to each table
drop trigger if exists set_user_id_products on public.products;
create trigger set_user_id_products
before insert on public.products
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_purchases on public.purchases;
create trigger set_user_id_purchases
before insert on public.purchases
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_shopping_list on public.shopping_list;
create trigger set_user_id_shopping_list
before insert on public.shopping_list
for each row execute function public.set_user_id_from_auth();

-- 4. Enable RLS
alter table public.products enable row level security;
alter table public.purchases enable row level security;
alter table public.shopping_list enable row level security;

-- 5. Per-user policies
do $$
declare
  t text;
begin
  foreach t in array array['products', 'purchases', 'shopping_list']
  loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);

    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select to authenticated using (user_id = auth.uid())',
      t
    );
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check (user_id is null or user_id = auth.uid())',
      t
    );
    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
