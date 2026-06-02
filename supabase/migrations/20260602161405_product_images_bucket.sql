-- Public storage bucket for product descriptive photos.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public can read product images"
on storage.objects for select
to public
using (bucket_id = 'product-images');

create policy "Users can upload own product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update own product images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'product-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can delete own product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
