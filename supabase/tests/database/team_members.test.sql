begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(19);

insert into auth.users (id, email)
values
  ('af111111-1111-4111-8111-111111111111', 'members-a@example.com'),
  ('af222222-2222-4222-8222-222222222222', 'members-b@example.com'),
  ('af333333-3333-4333-8333-333333333333', 'members-c@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('af111111-1111-4111-8111-111111111111', 'members_user_a'),
  ('af222222-2222-4222-8222-222222222222', 'members_user_b'),
  ('af333333-3333-4333-8333-333333333333', 'members_user_c')
on conflict (id) do nothing;

select is(
  (
    select count(*)::integer
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'team_members'
  ),
  1,
  'team_members table exists'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teams'
      and column_name in ('user_a_id', 'user_b_id')
  ),
  0,
  'teams pair columns are gone'
);

select is(private.max_team_size(), 2, 'duo cap is 2');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'af111111-1111-4111-8111-111111111111', true);

select set_config(
  'request.team_ab',
  public.create_team_invite_service('af222222-2222-4222-8222-222222222222', null)::text,
  true
);

select set_config(
  'request.team_ac',
  public.create_team_invite_service('af333333-3333-4333-8333-333333333333', null)::text,
  true
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.team_members member
    where member.team_id = current_setting('request.team_ab')::uuid
  ),
  2,
  'invite inserts both members'
);

select ok(
  (
    select count(*)::integer = 2
      and bool_and(member.user_id in (
        'af111111-1111-4111-8111-111111111111',
        'af222222-2222-4222-8222-222222222222'
      ))
    from public.team_members member
    where member.team_id = current_setting('request.team_ab')::uuid
  ),
  'invite members are the initiator and partner'
);

select throws_ok(
  format(
    $$insert into public.team_members (team_id, user_id)
      values ('%s'::uuid, 'af333333-3333-4333-8333-333333333333')$$,
    current_setting('request.team_ab')
  ),
  '23514',
  'team_member_cap_exceeded',
  'member cap trigger rejects a third teammate'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'af222222-2222-4222-8222-222222222222', true);

select ok(
  public.accept_team_invite_service(current_setting('request.team_ab')::uuid, true),
  'first pending invite can be accepted'
);

select set_config('request.jwt.claim.sub', 'af333333-3333-4333-8333-333333333333', true);
select ok(
  (
    select not public.accept_team_invite_service(
      current_setting('request.team_ac')::uuid,
      true
    )
  ),
  'second pending invite cannot activate once a member already has an active team'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.teams team
    where team.status = 'active'::public.team_status
      and team.id in (
        current_setting('request.team_ab')::uuid,
        current_setting('request.team_ac')::uuid
      )
  ),
  1,
  'exactly one of the two pending teams becomes active'
);

select ok(
  private.is_active_team_pair(
    'af111111-1111-4111-8111-111111111111',
    'af222222-2222-4222-8222-222222222222'
  ),
  'is_active_team_pair stays true for the accepted pair'
);

select ok(
  not private.is_active_team_pair(
    'af111111-1111-4111-8111-111111111111',
    'af333333-3333-4333-8333-333333333333'
  ),
  'is_active_team_pair stays false for the rejected pair'
);

select is(
  (
    select cardinality(
      private.subject_member_ids(
        'team'::public.social_subject_kind,
        current_setting('request.team_ab')::uuid
      )
    )
  ),
  2,
  'subject_member_ids returns both members'
);

select ok(
  (
    select private.subject_member_ids(
      'team'::public.social_subject_kind,
      current_setting('request.team_ab')::uuid
    ) @> array[
      'af111111-1111-4111-8111-111111111111'::uuid,
      'af222222-2222-4222-8222-222222222222'::uuid
    ]
  ),
  'subject_member_ids contains the accepted roster'
);

select is(
  private.active_team_for_user('af111111-1111-4111-8111-111111111111'),
  current_setting('request.team_ab')::uuid,
  'active_team_for_user resolves through team_members'
);

select is(
  private.team_id_for_pair(
    'af111111-1111-4111-8111-111111111111',
    'af222222-2222-4222-8222-222222222222'
  ),
  current_setting('request.team_ab')::uuid,
  'team_id_for_pair returns the shared active team'
);

-- Social Duo 4 dropped public.team_preferences (unreachable configuration:
-- no route, no RPC, no UI). Assert the membership fan-out it used to proxy for.
select is(
  (
    select count(*)::integer
    from public.team_members member
    where member.team_id = current_setting('request.team_ab')::uuid
  ),
  2,
  'accept fans membership out to every member'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'af111111-1111-4111-8111-111111111111',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_team_state()
    where team_id = current_setting('request.team_ab')::uuid
  ),
  1,
  'get_team_state returns one row per duo team'
);

reset role;
alter table public.team_members disable trigger team_members_assert_cap;
insert into public.team_members (team_id, user_id, role)
values (
  current_setting('request.team_ab')::uuid,
  'af333333-3333-4333-8333-333333333333',
  'member'
);
alter table public.team_members enable trigger team_members_assert_cap;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'af111111-1111-4111-8111-111111111111',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_team_state()
    where team_id = current_setting('request.team_ab')::uuid
  ),
  1,
  'get_team_state stays one row if the duo cap is bypassed'
);

-- private.team_id_for_pair exists so pair-scoped callers cannot silently resolve
-- the wrong team. One-active-team-per-user is enforced in the invite/accept RPCs,
-- not the schema, so bypass those to prove the guard fires instead of guessing.
reset role;
insert into public.teams (
  id, initiator_id, status, invited_at, accepted_at, visibility_acknowledged_at
)
values (
  'af900000-0000-4000-8000-000000000001',
  'af111111-1111-4111-8111-111111111111',
  'active',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days'
);
insert into public.team_members (team_id, user_id, role)
values
  ('af900000-0000-4000-8000-000000000001', 'af111111-1111-4111-8111-111111111111', 'initiator'),
  ('af900000-0000-4000-8000-000000000001', 'af222222-2222-4222-8222-222222222222', 'member');

select throws_ok(
  $$select private.team_id_for_pair(
      'af111111-1111-4111-8111-111111111111'::uuid,
      'af222222-2222-4222-8222-222222222222'::uuid
    )$$,
  '23514',
  'ambiguous_active_team_pair',
  'team_id_for_pair raises rather than picking when a pair shares two active teams'
);

select * from finish();
rollback;
