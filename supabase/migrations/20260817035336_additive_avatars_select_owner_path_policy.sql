drop policy if exists "avatars_select_owner_path" on storage.objects;
create policy "avatars_select_owner_path"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);
