begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(20);

set local role service_role;

delete from public.user_awards
where user_id = '11111111-1111-4111-8111-111111111111';

delete from public.xp_ledger
where user_id = '11111111-1111-4111-8111-111111111111';

delete from public.xp_profiles
where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.goals (
  id,
  owner_id,
  title,
  description,
  category,
  color,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date
)
values
  (
    'b3400000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'XP recompute integration goal',
    null,
    'health',
    '#10b981',
    'recurring',
    'weekly',
    3,
    current_date - 30,
    current_date + 30
  )
on conflict (id) do nothing;

update public.goals
set
  category = 'health',
  category_key = 'health',
  target_count = 3,
  start_date = current_date - 30,
  end_date = current_date + 30
where id = 'b3400000-0000-4000-8000-000000000001';

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'first completion succeeds'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date - 1
    );
  $tap$,
  'second completion succeeds'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date - 2
    );
  $tap$,
  'third completion succeeds and hits achievement threshold'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
      and l.track_key = 'health'
  ),
  160,
  'three credited completions plus one achievement yield 160 xp on health track'
);

select is(
  (
    select count(*)
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
      and l.event_type = 'completion_credit'
      and l.entry_kind = 'award'
  ),
  3::bigint,
  'three credited completions emit three completion-credit award rows'
);

select is(
  (
    select count(distinct l.completion_id)
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
      and l.event_type = 'completion_credit'
      and l.entry_kind = 'award'
  ),
  3::bigint,
  'completion-credit award rows are one-to-one with completion events'
);

select ok(
  not exists (
    select 1
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
      and l.event_type = 'completion_credit'
      and l.source_key !~ '^completion:[0-9a-fA-F-]{36}$'
  ),
  'completion-credit rows use completion-event source keys'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'duplicate same-day mark is accepted as idempotent'
);

select is(
  (
    select count(*)
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
      and l.event_type = 'completion_credit'
      and l.entry_kind = 'award'
  ),
  3::bigint,
  'same-day duplicate mark does not add completion-credit rows'
);

select ok(
  exists(
    select 1
    from public.user_awards ua
    join public.xp_rewards xr on xr.id = ua.reward_id
    where ua.user_id = '11111111-1111-4111-8111-111111111111'
      and xr.level = 2
      and ua.revoked_at is null
  ),
  'crossing level threshold unlocks level-2 reward'
);

select lives_ok(
  $tap$
    select public.unmark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date - 2
    );
  $tap$,
  'unmarking a credited completion succeeds'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
      and l.track_key = 'health'
  ),
  40,
  'achievement and unit xp both reverse when progress drops below target'
);

select ok(
  exists(
    select 1
    from public.user_awards ua
    join public.xp_rewards xr on xr.id = ua.reward_id
    where ua.user_id = '11111111-1111-4111-8111-111111111111'
      and xr.level = 2
      and ua.revoked_at is not null
  ),
  'reward row is retained and marked revoked after regression'
);

reset role;
set local role service_role;

select is(
  (
    select public.recompute_goal_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'b3400000-0000-4000-8000-000000000001',
      false
    )
  ),
  0,
  'recompute rerun is idempotent when no completion facts changed'
);

select ok(
  position(
    'RECOMPUTE_GOAL_XP_SERVICE'
    in upper(pg_get_functiondef('public.mark_goal_complete(uuid, date)'::regprocedure))
  ) > 0,
  'mark_goal_complete definition includes explicit xp recompute call'
);

select ok(
  position(
    'RECOMPUTE_GOAL_XP_SERVICE'
    in upper(pg_get_functiondef('public.unmark_goal_complete(uuid, date)'::regprocedure))
  ) > 0,
  'unmark_goal_complete definition includes explicit xp recompute call'
);

select ok(
  (
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:1',
      25
    )
  ) is not null,
  'first social award inserts a ledger row'
);

select ok(
  (
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:1',
      25
    )
  ) is null,
  'duplicate social award key is idempotent'
);

select ok(
  (
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:1:reversal',
      -10
    )
  ) is not null,
  'negative social xp writes a reversal row'
);

select is(
  (
    select p.total_xp
    from public.xp_profiles p
    where p.user_id = '11111111-1111-4111-8111-111111111111'
      and p.track_key = 'global'
  ),
  55,
  'global profile total reflects goal xp plus social award deltas'
);

select is(
  (
    select p.total_xp
    from public.xp_profiles p
    where p.user_id = '11111111-1111-4111-8111-111111111111'
      and p.track_key = 'health'
  ),
  40,
  'health track profile remains scoped to goal-derived xp only'
);

reset role;
select * from finish();
rollback;
