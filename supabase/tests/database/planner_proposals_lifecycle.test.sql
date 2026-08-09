begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

insert into auth.users (id, email)
values
  ('9a711111-1111-4111-8111-111111111111', 'proposal-proposer@example.com'),
  ('9a722222-2222-4222-8222-222222222222', 'proposal-target@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('9a711111-1111-4111-8111-111111111111', 'proposal_proposer'),
  ('9a722222-2222-4222-8222-222222222222', 'proposal_target')
on conflict (id) do nothing;

set local role service_role;

insert into public.duos (
  id,
  user_a_id,
  user_b_id,
  initiator_id,
  status,
  invited_at,
  accepted_at,
  visibility_acknowledged_at
)
values (
  '9a730000-0000-4000-8000-000000000001',
  '9a711111-1111-4111-8111-111111111111',
  '9a722222-2222-4222-8222-222222222222',
  '9a711111-1111-4111-8111-111111111111',
  'active',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days'
)
on conflict (id) do nothing;

insert into public.duo_preferences (
  duo_id,
  user_id,
  share_planner,
  allow_proposals
)
values
  ('9a730000-0000-4000-8000-000000000001', '9a711111-1111-4111-8111-111111111111', true, true),
  ('9a730000-0000-4000-8000-000000000001', '9a722222-2222-4222-8222-222222222222', true, true)
on conflict (duo_id, user_id) do update
set share_planner = excluded.share_planner,
    allow_proposals = excluded.allow_proposals;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a711111-1111-4111-8111-111111111111', true);

select ok(
  public.create_planner_proposal_service(
    '9a722222-2222-4222-8222-222222222222',
    date '2026-08-01',
    '[{"op":"clear_month"}]'::jsonb,
    'Please reset the month'
  ) is not null,
  'proposer can create pending planner proposal for active duo partner'
);

select is(
  (
    select count(*)::integer
    from public.get_planner_proposals_service(date '2026-08-01') proposal
    where proposal.status = 'pending'
  ),
  1,
  'proposal appears as pending for proposer'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a722222-2222-4222-8222-222222222222', true);

select ok(
  public.resolve_planner_proposal_service(
    (
      select proposal.id
      from public.get_planner_proposals_service(date '2026-08-01') proposal
      limit 1
    ),
    'rejected'::public.planner_proposal_status,
    null
  ),
  'target owner can reject pending proposal'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a711111-1111-4111-8111-111111111111', true);

select is(
  (
    select proposal.status
    from public.get_planner_proposals_service(date '2026-08-01') proposal
    order by proposal.created_at desc
    limit 1
  ),
  'rejected'::public.planner_proposal_status,
  'proposal status updates to rejected after owner decision'
);

select ok(
  public.create_planner_proposal_service(
    '9a722222-2222-4222-8222-222222222222',
    date '2026-08-01',
    '[{"op":"clear_month"}]'::jsonb,
    null
  ) is not null,
  'proposer can create a new proposal after prior one is resolved'
);

select ok(
  public.resolve_planner_proposal_service(
    (
      select proposal.id
      from public.get_planner_proposals_service(date '2026-08-01') proposal
      where proposal.status = 'pending'
      order by proposal.created_at desc
      limit 1
    ),
    'withdrawn'::public.planner_proposal_status,
    null
  ),
  'proposer can withdraw own pending proposal'
);

reset role;
set local role service_role;
update public.duo_preferences
set allow_proposals = false
where duo_id = '9a730000-0000-4000-8000-000000000001'
  and user_id = '9a722222-2222-4222-8222-222222222222';

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a711111-1111-4111-8111-111111111111', true);

select throws_ok(
  $$select public.create_planner_proposal_service(
      '9a722222-2222-4222-8222-222222222222',
      date '2026-08-01',
      '[{"op":"clear_month"}]'::jsonb,
      null
    )$$,
  '42501',
  'proposals_not_allowed',
  'allow_proposals preference blocks new proposals immediately'
);

select * from finish();
rollback;
