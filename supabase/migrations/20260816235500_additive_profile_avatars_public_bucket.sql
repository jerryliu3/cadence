insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_insert_owner_path" on storage.objects;
create policy "avatars_insert_owner_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

drop policy if exists "avatars_update_owner_path" on storage.objects;
create policy "avatars_update_owner_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

drop policy if exists "avatars_delete_owner_path" on storage.objects;
create policy "avatars_delete_owner_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_url_storage_public_prefix'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_url_storage_public_prefix
      check (
        avatar_url is null
        or avatar_url ~ '^https?://[^/]+/storage/v1/object/public/avatars/[^[:space:]]+$'
      )
      not valid;
  end if;
end $$;
