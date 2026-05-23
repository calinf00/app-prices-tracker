-- Group multiple images / line-items belonging to the same scanned receipt.
alter table public.purchases
  add column if not exists receipt_group_id uuid;

create index if not exists purchases_receipt_group_id_idx
  on public.purchases(receipt_group_id);

create table if not exists public.receipt_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  receipt_group_id uuid not null,
  storage_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists receipt_images_group_idx
  on public.receipt_images(receipt_group_id);

drop trigger if exists set_user_id_receipt_images on public.receipt_images;
create trigger set_user_id_receipt_images
before insert on public.receipt_images
for each row execute function public.set_user_id_from_auth();

alter table public.receipt_images enable row level security;

drop policy if exists "receipt_images_select_own" on public.receipt_images;
drop policy if exists "receipt_images_insert_own" on public.receipt_images;
drop policy if exists "receipt_images_delete_own" on public.receipt_images;

create policy "receipt_images_select_own"
on public.receipt_images for select to authenticated
using (user_id = auth.uid());

create policy "receipt_images_insert_own"
on public.receipt_images for insert to authenticated
with check (user_id is null or user_id = auth.uid());

create policy "receipt_images_delete_own"
on public.receipt_images for delete to authenticated
using (user_id = auth.uid());
