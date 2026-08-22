begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

select is(
  public.provision_synthetic_users_service(4, 2),
  4,
  'provisioning creates synthetic users for admin view coverage'
);

select is(
  (select count(*)::integer from public.admin_synthetic_users),
  4,
  'admin view lists every synthetic user'
);

select ok(
  (
    select bool_and(profile.username = roster.username)
    from public.admin_synthetic_users roster
    join public.profiles profile on profile.id = roster.user_id
  ),
  'admin view exposes profile usernames'
);

select ok(
  (
    select bool_and(roster.goal_count = 2)
    from public.admin_synthetic_users roster
  ),
  'admin view reports non-deleted goal counts'
);

update public.admin_synthetic_users
set
  enabled = false,
  persona = 'low',
  daily_budget = 2,
  display_name = 'Admin Renamed',
  social_activity_visible = false
where user_id = (
  select user_id from public.admin_synthetic_users order by username limit 1
);

select is(
  (
    select synthetic.enabled
    from public.synthetic_users synthetic
    join public.admin_synthetic_users roster
      on roster.user_id = synthetic.user_id
    where roster.display_name = 'Admin Renamed'
  ),
  false,
  'updating the admin view writes synthetic_users fields'
);

select is(
  (
    select profile.social_activity_visible
    from public.profiles profile
    where profile.display_name = 'Admin Renamed'
  ),
  false,
  'updating the admin view writes profile fields'
);

delete from public.admin_synthetic_users
where user_id = (
  select user_id from public.admin_synthetic_users order by username offset 1 limit 1
);

select is(
  (
    select count(*)::integer
    from public.synthetic_users
    where enabled = false
  ),
  2,
  'deleting from the admin view disables the user instead of removing the row'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $tap$
    select * from public.admin_synthetic_users;
  $tap$,
  '42501',
  null,
  'authenticated users cannot read the admin synthetic view'
);

select * from finish();
rollback;
