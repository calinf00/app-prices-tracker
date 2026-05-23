-- Storage bucket for receipt images
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Users can read own receipts"
on storage.objects for select
to authenticated
using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can upload own receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own receipts"
on storage.objects for delete
to authenticated
using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

alter table public.purchases
  add column if not exists receipt_url text;
