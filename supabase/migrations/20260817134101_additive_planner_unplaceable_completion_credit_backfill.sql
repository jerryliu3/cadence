-- One-time production backfill:
-- Recompute durable capacity shortfall counts using completion credit so
-- completed goals do not keep stale planner_goal_unplaceable warnings.
with candidate_rows as (
  select
    state.owner_id,
    state.goal_id,
    goal.frequency_type,
    goal.recurrence_interval,
    greatest(coalesce(goal.target_count, 0), 0)::integer as target_count,
    goal.start_date,
    goal.end_date,
    state.effective_span_end,
    private.local_today_for_timezone(coalesce(profile.timezone, 'UTC')) as as_of_date,
    coalesce(profile.week_starts_on, 1)::smallint as week_starts_on
  from public.planner_goal_unplaceable state
  join public.goals goal
    on goal.id = state.goal_id
   and goal.owner_id = state.owner_id
  join public.profiles profile
    on profile.id = state.owner_id
  where state.reason = 'capacity'
),
goal_windows as (
  select
    candidate.owner_id,
    candidate.goal_id,
    candidate.frequency_type,
    candidate.recurrence_interval,
    candidate.target_count,
    candidate.start_date,
    candidate.end_date,
    candidate.as_of_date,
    candidate.week_starts_on,
    greatest(candidate.start_date, candidate.as_of_date) as effective_start,
    least(
      coalesce(candidate.end_date, candidate.effective_span_end),
      candidate.effective_span_end
    ) as effective_end
  from candidate_rows candidate
),
required_units as (
  select
    goal_window.owner_id,
    goal_window.goal_id,
    ('milestone:' || ordinal.ordinality)::text as unit_key
  from goal_windows goal_window
  cross join lateral generate_series(1, goal_window.target_count) as ordinal(ordinality)
  where goal_window.frequency_type = 'fixed_milestones'
    and goal_window.target_count > 0
    and goal_window.effective_end >= goal_window.effective_start

  union all

  select
    goal_window.owner_id,
    goal_window.goal_id,
    ('total:' || ordinal.ordinality)::text as unit_key
  from goal_windows goal_window
  cross join lateral generate_series(1, goal_window.target_count) as ordinal(ordinality)
  where goal_window.frequency_type = 'recurring'
    and goal_window.target_count > 0
    and goal_window.effective_end >= goal_window.effective_start

  union

  select
    goal_window.owner_id,
    goal_window.goal_id,
    (
      'cadence:' || private.planner_cadence_period_key(
        goal_window.recurrence_interval,
        series.day::date,
        goal_window.week_starts_on
      )
    )::text as unit_key
  from goal_windows goal_window
  cross join lateral generate_series(
    goal_window.effective_start::timestamp,
    goal_window.effective_end::timestamp,
    interval '1 day'
  ) as series(day)
  where goal_window.frequency_type = 'recurring'
    and goal_window.target_count <= 0
    and goal_window.recurrence_interval is not null
    and goal_window.effective_end >= goal_window.effective_start
),
valid_scheduled_units as (
  select distinct
    goal_window.owner_id,
    goal_window.goal_id,
    item.unit_key
  from goal_windows goal_window
  join public.planner_items item
    on item.owner_id = goal_window.owner_id
   and item.goal_id = goal_window.goal_id
  where private.planner_schedule_item_matches_requirement(
    goal_window.frequency_type,
    goal_window.recurrence_interval,
    goal_window.target_count,
    goal_window.start_date,
    goal_window.end_date,
    item.unit_key,
    item.scheduled_date,
    goal_window.week_starts_on
  )
),
admissible_completions as (
  select
    goal_window.owner_id,
    goal_window.goal_id,
    completion.id as completion_id,
    completion.completed_on
  from goal_windows goal_window
  join public.completions completion
    on completion.goal_id = goal_window.goal_id
   and completion.user_id = goal_window.owner_id
  where completion.completed_on >= goal_window.start_date
    and completion.completed_on <= least(
      goal_window.as_of_date,
      coalesce(goal_window.end_date, goal_window.as_of_date)
    )
),
milestone_completion_counts as (
  select
    goal_window.owner_id,
    goal_window.goal_id,
    least(goal_window.target_count, count(completion.completion_id))::integer as credited_count
  from goal_windows goal_window
  left join admissible_completions completion
    on completion.owner_id = goal_window.owner_id
   and completion.goal_id = goal_window.goal_id
  where goal_window.frequency_type = 'fixed_milestones'
    and goal_window.target_count > 0
    and goal_window.effective_end >= goal_window.effective_start
  group by
    goal_window.owner_id,
    goal_window.goal_id,
    goal_window.target_count
),
milestone_completion_units as (
  select
    completion_count.owner_id,
    completion_count.goal_id,
    ('milestone:' || ordinal.ordinality)::text as unit_key
  from milestone_completion_counts completion_count
  join lateral generate_series(1, completion_count.credited_count) as ordinal(ordinality)
    on true
),
deadline_scheduled_units as (
  select
    goal_window.owner_id,
    goal_window.goal_id,
    item.unit_key,
    item.scheduled_date
  from goal_windows goal_window
  join public.planner_items item
    on item.owner_id = goal_window.owner_id
   and item.goal_id = goal_window.goal_id
  where goal_window.frequency_type = 'recurring'
    and goal_window.target_count > 0
    and item.unit_key ~ '^total:[1-9][0-9]*$'
    and private.planner_schedule_item_matches_requirement(
      goal_window.frequency_type,
      goal_window.recurrence_interval,
      goal_window.target_count,
      goal_window.start_date,
      goal_window.end_date,
      item.unit_key,
      item.scheduled_date,
      goal_window.week_starts_on
    )
),
deadline_direct_credits as (
  select
    scheduled.owner_id,
    scheduled.goal_id,
    scheduled.unit_key,
    completion.completion_id
  from deadline_scheduled_units scheduled
  join admissible_completions completion
    on completion.owner_id = scheduled.owner_id
   and completion.goal_id = scheduled.goal_id
   and completion.completed_on = scheduled.scheduled_date
),
deadline_remaining_units as (
  select
    goal_window.owner_id,
    goal_window.goal_id,
    ('total:' || ordinal.ordinality)::text as unit_key,
    row_number() over (
      partition by goal_window.owner_id, goal_window.goal_id
      order by ordinal.ordinality
    ) as unit_rank
  from goal_windows goal_window
  join lateral generate_series(1, goal_window.target_count) as ordinal(ordinality)
    on true
  left join deadline_direct_credits direct
    on direct.owner_id = goal_window.owner_id
   and direct.goal_id = goal_window.goal_id
   and direct.unit_key = ('total:' || ordinal.ordinality)::text
  where goal_window.frequency_type = 'recurring'
    and goal_window.target_count > 0
    and goal_window.effective_end >= goal_window.effective_start
    and direct.unit_key is null
),
deadline_remaining_completions as (
  select
    completion.owner_id,
    completion.goal_id,
    completion.completion_id,
    row_number() over (
      partition by completion.owner_id, completion.goal_id
      order by completion.completed_on, completion.completion_id
    ) as completion_rank
  from admissible_completions completion
  join goal_windows goal_window
    on goal_window.owner_id = completion.owner_id
   and goal_window.goal_id = completion.goal_id
  where goal_window.frequency_type = 'recurring'
    and goal_window.target_count > 0
    and not exists (
      select 1
      from deadline_direct_credits direct
      where direct.owner_id = completion.owner_id
        and direct.goal_id = completion.goal_id
        and direct.completion_id = completion.completion_id
    )
),
deadline_fallback_credits as (
  select
    units.owner_id,
    units.goal_id,
    units.unit_key
  from deadline_remaining_units units
  join deadline_remaining_completions completion
    on completion.owner_id = units.owner_id
   and completion.goal_id = units.goal_id
   and completion.completion_rank = units.unit_rank
),
deadline_completion_units as (
  select
    direct.owner_id,
    direct.goal_id,
    direct.unit_key
  from deadline_direct_credits direct

  union

  select
    fallback.owner_id,
    fallback.goal_id,
    fallback.unit_key
  from deadline_fallback_credits fallback
),
cadence_completion_units as (
  select distinct
    goal_window.owner_id,
    goal_window.goal_id,
    (
      'cadence:' || private.planner_cadence_period_key(
        goal_window.recurrence_interval,
        completion.completed_on,
        goal_window.week_starts_on
      )
    )::text as unit_key
  from goal_windows goal_window
  join admissible_completions completion
    on completion.owner_id = goal_window.owner_id
   and completion.goal_id = goal_window.goal_id
  where goal_window.frequency_type = 'recurring'
    and goal_window.target_count <= 0
    and goal_window.recurrence_interval is not null
),
credited_completion_units as (
  select
    unit.owner_id,
    unit.goal_id,
    unit.unit_key
  from milestone_completion_units unit

  union

  select
    unit.owner_id,
    unit.goal_id,
    unit.unit_key
  from deadline_completion_units unit

  union

  select
    unit.owner_id,
    unit.goal_id,
    unit.unit_key
  from cadence_completion_units unit
),
resolved_units as (
  select
    unit.owner_id,
    unit.goal_id,
    unit.unit_key
  from valid_scheduled_units unit

  union

  select
    unit.owner_id,
    unit.goal_id,
    unit.unit_key
  from credited_completion_units unit
),
required_counts as (
  select
    required.owner_id,
    required.goal_id,
    count(distinct required.unit_key)::integer as required_count
  from required_units required
  group by required.owner_id, required.goal_id
),
resolved_counts as (
  select
    required.owner_id,
    required.goal_id,
    count(distinct required.unit_key)::integer as resolved_count
  from required_units required
  join resolved_units resolved
    on resolved.owner_id = required.owner_id
   and resolved.goal_id = required.goal_id
   and resolved.unit_key = required.unit_key
  group by required.owner_id, required.goal_id
),
backfill as (
  select
    goal_window.owner_id,
    goal_window.goal_id,
    greatest(
      coalesce(required.required_count, 0) - coalesce(resolved.resolved_count, 0),
      0
    )::integer as corrected_unplaced_count
  from goal_windows goal_window
  left join required_counts required
    on required.owner_id = goal_window.owner_id
   and required.goal_id = goal_window.goal_id
  left join resolved_counts resolved
    on resolved.owner_id = goal_window.owner_id
   and resolved.goal_id = goal_window.goal_id
),
updated as (
  update public.planner_goal_unplaceable state
  set
    unplaced_count = backfill.corrected_unplaced_count,
    computed_at = now()
  from backfill
  where state.owner_id = backfill.owner_id
    and state.goal_id = backfill.goal_id
    and state.reason = 'capacity'
    and state.unplaced_count <> backfill.corrected_unplaced_count
  returning state.owner_id, state.goal_id
)
delete from public.planner_goal_unplaceable state
using backfill
where state.owner_id = backfill.owner_id
  and state.goal_id = backfill.goal_id
  and state.reason = 'capacity'
  and backfill.corrected_unplaced_count = 0;
