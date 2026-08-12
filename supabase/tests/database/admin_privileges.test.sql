begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

insert into auth.users (id, email)
values
  ('77111111-1111-4111-8111-111111111111', 'admin-role-admin@example.com'),
  ('77222222-2222-4222-8222-222222222222', 'admin-role-mod@example.com'),
  ('77333333-3333-4333-8333-333333333333', 'admin-role-user@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('77111111-1111-4111-8111-111111111111', 's2_admin_user'),
  ('77222222-2222-4222-8222-222222222222', 's2_mod_user'),
  ('77333333-3333-4333-8333-333333333333', 's2_regular_user')
on conflict (id) do nothing;

set local role service_role;
insert into public.admin_users (user_id, role, granted_by)
values
  ('77111111-1111-4111-8111-111111111111', 'admin', '77111111-1111-4111-8111-111111111111'),
  ('77222222-2222-4222-8222-222222222222', 'moderator', '77111111-1111-4111-8111-111111111111')
on conflict (user_id) do update
set role = excluded.role,
    granted_by = excluded.granted_by,
    revoked_at = null;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '77333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $tap$
    select * from public.admin_users;
  $tap$,
  '42501',
  null,
  'authenticated users cannot read admin_users'
);

select throws_ok(
  $tap$
    insert into public.admin_users (user_id, role)
    values ('77333333-3333-4333-8333-333333333333', 'admin');
  $tap$,
  '42501',
  null,
  'authenticated users cannot write admin_users'
);

select is(
  public.is_platform_admin('moderator'),
  false,
  'non-admin users are not platform admins'
);

select set_config('request.jwt.claim.sub', '77111111-1111-4111-8111-111111111111', true);

select is(
  public.is_platform_admin('moderator'),
  true,
  'admin role satisfies moderator minimum'
);

select is(
  public.is_platform_admin('admin'),
  true,
  'admin role satisfies admin minimum'
);

select set_config('request.jwt.claim.sub', '77222222-2222-4222-8222-222222222222', true);

select is(
  public.is_platform_admin('moderator'),
  true,
  'moderator role satisfies moderator minimum'
);

select is(
  public.is_platform_admin('admin'),
  false,
  'moderator role does not satisfy admin minimum'
);

set local role service_role;
update public.admin_users
set revoked_at = pg_catalog.now()
where user_id = '77222222-2222-4222-8222-222222222222';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '77222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.is_platform_admin('moderator'),
  false,
  'revoked admin rows are not treated as active admins'
);

select * from finish();
rollback;
