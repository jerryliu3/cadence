begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(8);

insert into auth.users (id, email)
values
  ('9a111111-1111-4111-8111-111111111111', 'duo-owner@example.com'),
  ('9a222222-2222-4222-8222-222222222222', 'duo-partner@example.com'),
  ('9a333333-3333-4333-8333-333333333333', 'duo-outsider@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('9a111111-1111-4111-8111-111111111111', 'duo_owner'),
  ('9a222222-2222-4222-8222-222222222222', 'duo_partner'),
  ('9a333333-3333-4333-8333-333333333333', 'duo_outsider')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a111111-1111-4111-8111-111111111111', true);

create temporary table _duo_ctx as
select public.create_duo_invite_service('9a222222-2222-4222-8222-222222222222', null) as duo_id;

select set_config('request.jwt.claim.sub', '9a222222-2222-4222-8222-222222222222', true);
select ok(
  public.accept_duo_invite_service((select duo_id from _duo_ctx), true),
  'partner accepts duo invite'
);

reset role;
set local role service_role;
insert into public.goals (
  id,
  owner_id,
  title,
  category,
  category_key,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_group,
  partner_visibility
)
values
  (
    '9a400000-0000-4000-8000-000000000001',
    '9a111111-1111-4111-8111-111111111111',
    'Partner shared goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 5,
    false,
    'shared'
  ),
  (
    '9a400000-0000-4000-8000-000000000002',
    '9a111111-1111-4111-8111-111111111111',
    'Partner excluded goal',
    'Health',
    'health',
    'recurring',
    'weekly',
    3,
    current_date - 5,
    current_date + 5,
    false,
    'excluded'
  )
on conflict (id) do nothing;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a222222-2222-4222-8222-222222222222', true);

select is(
  (
    select count(*)::integer
    from public.profiles profile
    where profile.id = '9a111111-1111-4111-8111-111111111111'
  ),
  0,
  'partner still cannot directly select owner profile row'
);

select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '9a111111-1111-4111-8111-111111111111'
      and public.can_view_goal_content(goal.id, '9a222222-2222-4222-8222-222222222222')
  ),
  1,
  'partner sees only shared goals through duo visibility'
);

select ok(
  (
    select not public.can_complete_goal(
      '9a400000-0000-4000-8000-000000000001',
      '9a222222-2222-4222-8222-222222222222'
    )
  ),
  'duo partner cannot complete owner goals'
);

select ok(
  (
    select (public.get_partner_profile_service('9a111111-1111-4111-8111-111111111111') ? 'username')
      and not (public.get_partner_profile_service('9a111111-1111-4111-8111-111111111111') ? 'timezone')
  ),
  'partner profile projection includes exposed fields and excludes non-exposed fields'
);

reset role;
set local role service_role;
update public.partner_profile_fields
set is_exposed = true
where field = 'timezone';
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a222222-2222-4222-8222-222222222222', true);

select ok(
  (
    select public.get_partner_profile_service('9a111111-1111-4111-8111-111111111111') ? 'timezone'
  ),
  'partner profile field toggles apply without deploy'
);

select set_config('request.jwt.claim.sub', '9a111111-1111-4111-8111-111111111111', true);
select ok(
  public.dissolve_duo_service(),
  'owner can dissolve active duo'
);

select set_config('request.jwt.claim.sub', '9a222222-2222-4222-8222-222222222222', true);
select is(
  (
    select count(*)::integer
    from public.goals goal
    where goal.owner_id = '9a111111-1111-4111-8111-111111111111'
      and public.can_view_goal_content(goal.id, '9a222222-2222-4222-8222-222222222222')
  ),
  0,
  'duo visibility is revoked after dissolution'
);

select * from finish();
rollback;
