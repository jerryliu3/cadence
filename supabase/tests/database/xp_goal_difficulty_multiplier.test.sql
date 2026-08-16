begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(12);

set local role service_role;

delete from public.completions
where goal_id = 'c9400000-0000-4000-8000-000000000001'
  and user_id = '11111111-1111-4111-8111-111111111111';

delete from public.xp_ledger
where goal_id = 'c9400000-0000-4000-8000-000000000001'
  and user_id = '11111111-1111-4111-8111-111111111111';

delete from public.goals
where id = 'c9400000-0000-4000-8000-000000000001';

insert into public.goals (
  id,
  owner_id,
  title,
  category,
  category_key,
  color,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  difficulty
)
values (
  'c9400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'XP difficulty integration goal',
  'Health',
  'health',
  '#10b981',
  'recurring',
  'daily',
  null,
  current_date - 7,
  null,
  'hard'
);

insert into public.completions (goal_id, user_id, completed_on, source)
values (
  'c9400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  current_date,
  'manual'
);

select is(
  private.xp_goal_difficulty_multiplier('easy'::public.goal_difficulty),
  0.5::numeric,
  'easy goals use 0.5x XP multiplier'
);

select is(
  private.xp_goal_difficulty_multiplier('medium'::public.goal_difficulty),
  1.0::numeric,
  'medium goals use 1.0x XP multiplier'
);

select is(
  private.xp_goal_difficulty_multiplier('hard'::public.goal_difficulty),
  2.0::numeric,
  'hard goals use 2.0x XP multiplier'
);

select is(
  private.xp_points_for_completion_source(
    'manual'::public.completion_source,
    'easy'::public.goal_difficulty
  ),
  10,
  'manual completion XP is reduced for easy goals'
);

select is(
  private.xp_points_for_completion_source(
    'manual'::public.completion_source,
    'hard'::public.goal_difficulty
  ),
  40,
  'manual completion XP is doubled for hard goals'
);

select is(
  private.xp_points_for_completion_source(
    'linked_cascade'::public.completion_source,
    'easy'::public.goal_difficulty
  ),
  2,
  'linked cascade XP applies both cascade and easy multipliers'
);

select is(
  private.xp_points_for_completion_source(
    'linked_cascade'::public.completion_source,
    'hard'::public.goal_difficulty
  ),
  10,
  'linked cascade XP applies both cascade and hard multipliers'
);

select is(
  private.xp_goal_achievement_points('easy'::public.goal_difficulty),
  50,
  'goal achievements are reduced for easy goals'
);

select is(
  private.xp_goal_achievement_points('hard'::public.goal_difficulty),
  200,
  'goal achievements are doubled for hard goals'
);

select public.recompute_goal_xp_service(
  '11111111-1111-4111-8111-111111111111',
  'c9400000-0000-4000-8000-000000000001'
);

select is(
  (
    select coalesce(sum(xp_delta), 0)::integer
    from public.xp_ledger
    where user_id = '11111111-1111-4111-8111-111111111111'
      and goal_id = 'c9400000-0000-4000-8000-000000000001'
      and track_key = 'health'
  ),
  40,
  'hard difficulty goal recompute writes doubled completion XP'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select public.update_goal(
  'c9400000-0000-4000-8000-000000000001',
  'XP difficulty integration goal',
  null,
  null,
  'Health',
  'health',
  '#10b981',
  'recurring',
  'daily',
  null,
  null,
  current_date - 7,
  null,
  null,
  null,
  false,
  'easy'
);

select is(
  (
    select coalesce(sum(xp_delta), 0)::integer
    from public.xp_ledger
    where user_id = '11111111-1111-4111-8111-111111111111'
      and goal_id = 'c9400000-0000-4000-8000-000000000001'
      and track_key = 'health'
  ),
  40,
  'updating goal difficulty does not retroactively rewrite earned XP'
);

select public.update_goal(
  'c9400000-0000-4000-8000-000000000001',
  'XP difficulty integration goal (renamed)',
  null,
  null,
  'Health',
  'health',
  '#10b981',
  'recurring',
  'daily',
  null,
  null,
  current_date - 7,
  null,
  null,
  null,
  false
);

select is(
  (
    select difficulty::text
    from public.goals
    where id = 'c9400000-0000-4000-8000-000000000001'
  ),
  'easy',
  'update_goal preserves difficulty when older callers omit p_difficulty'
);

select * from finish();
rollback;
