begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(10);

insert into auth.users (id, email)
values
  ('8f111111-1111-4111-8111-111111111111', 'team-a@example.com'),
  ('8f222222-2222-4222-8222-222222222222', 'team-b@example.com'),
  ('8f333333-3333-4333-8333-333333333333', 'team-c@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('8f111111-1111-4111-8111-111111111111', 'team_user_a'),
  ('8f222222-2222-4222-8222-222222222222', 'team_user_b'),
  ('8f333333-3333-4333-8333-333333333333', 'team_user_c')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f111111-1111-4111-8111-111111111111', true);

select set_config(
  'request.team_id',
  public.create_team_invite_service(
    '8f222222-2222-4222-8222-222222222222',
    'hey lets pair'
  )::text,
  true
);

reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.teams team
    where team.id = current_setting('request.team_id')::uuid
      and team.status = 'pending'
      and (
        select count(*)::integer
        from public.team_members member
        where member.team_id = team.id
          and member.user_id in (
            '8f111111-1111-4111-8111-111111111111',
            '8f222222-2222-4222-8222-222222222222'
          )
      ) = 2
  ),
  1,
  'invite is created with both members on the pending team'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f222222-2222-4222-8222-222222222222', true);
select public.create_team_invite_service(
  '8f111111-1111-4111-8111-111111111111',
  'reciprocal'
);

reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.teams team
    where team.status = 'pending'
      and exists (
        select 1
        from public.team_members member
        where member.team_id = team.id
          and member.user_id = '8f111111-1111-4111-8111-111111111111'
      )
      and exists (
        select 1
        from public.team_members member
        where member.team_id = team.id
          and member.user_id = '8f222222-2222-4222-8222-222222222222'
      )
  ),
  1,
  'reciprocal invite reuses same pending team row'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    $$select public.accept_team_invite_service('%s'::uuid, false)$$,
    current_setting('request.team_id')
  ),
  '22023',
  'visibility_ack_required',
  'accept requires visibility acknowledgement'
);

select ok(
  public.accept_team_invite_service(
    current_setting('request.team_id')::uuid,
    true
  ),
  'invitee can accept with acknowledgement'
);

reset role;
set local role service_role;
select is(
  (
    select status
    from public.teams
    where id = current_setting('request.team_id')::uuid
  ),
  'active'::public.team_status,
  'accepted invite transitions team to active'
);

select is(
  (
    select closed_at
    from public.teams
    where id = current_setting('request.team_id')::uuid
  ),
  null::timestamptz,
  'active team row keeps closed_at null'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$select public.create_team_invite_service('8f333333-3333-4333-8333-333333333333', null)$$,
  '23514',
  'team_already_active',
  'single active team guard prevents second active pair for same user'
);

select ok(
  public.dissolve_team_service(),
  'active team can be dissolved by either member'
);

reset role;
set local role service_role;

select is(
  (
    select status
    from public.teams
    where id = current_setting('request.team_id')::uuid
  ),
  'closed'::public.team_status,
  'dissolve transitions active team to closed'
);

select ok(
  (
    select closed_at is not null
    from public.teams
    where id = current_setting('request.team_id')::uuid
  ),
  'closed team row records closed_at'
);

select * from finish();
rollback;
