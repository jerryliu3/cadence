begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(11);

select ok(
  exists(select 1 from storage.buckets where id = 'avatars'),
  'avatars bucket exists'
);

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'avatars bucket is public'
);

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  5242880::bigint,
  'avatars bucket limits file size to 5 MiB'
);

select is(
  (
    select array_to_string(allowed_mime_types, ',')
    from storage.buckets
    where id = 'avatars'
  ),
  'image/png,image/jpeg,image/webp',
  'avatars bucket mime allowlist is png/jpeg/webp'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_insert_owner_path'
  ),
  'avatars insert owner-path policy exists'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_update_owner_path'
  ),
  'avatars update owner-path policy exists'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_delete_owner_path'
  ),
  'avatars delete owner-path policy exists'
);

select is(
  (
    select convalidated
    from pg_constraint
    where conname = 'profiles_avatar_url_storage_public_prefix'
      and conrelid = 'public.profiles'::regclass
  ),
  false,
  'avatar_url storage-origin constraint is added as not valid'
);

insert into auth.users (id, email)
values (
  '44444444-4444-4444-8444-444444444444',
  'avatar-storage-contract@example.com'
)
on conflict (id) do nothing;

insert into public.profiles (id, username)
values (
  '44444444-4444-4444-8444-444444444444',
  'avatar_storage_contract'
)
on conflict (id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    update public.profiles
    set avatar_url = 'https://example.supabase.co/storage/v1/object/public/avatars/44444444-4444-4444-8444-444444444444/avatar.jpg?v=1'
    where id = '44444444-4444-4444-8444-444444444444'
  $$,
  'profile owner can set avatar_url to storage-origin avatar path'
);

select throws_ok(
  $$
    update public.profiles
    set avatar_url = 'https://images.example.com/avatar.jpg'
    where id = '44444444-4444-4444-8444-444444444444'
  $$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_avatar_url_storage_public_prefix"',
  'profile avatar_url rejects non-storage external URLs'
);

select lives_ok(
  $$
    update public.profiles
    set avatar_url = null
    where id = '44444444-4444-4444-8444-444444444444'
  $$,
  'profile owner can clear avatar_url'
);

reset role;
select * from finish();
rollback;
