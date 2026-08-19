-- XP phase 4 follow-up:
-- Cut completion-credit source identity over to completion events.
-- This removes ordinal slot source keys (milestone/total/cadence) from live XP attribution.

create or replace function private.goal_xp_credited_units(
  p_user_id uuid,
  p_goal_id uuid
)
returns table (
  source_key text,
  track_key text,
  event_type text,
  earned_on date,
  completion_id uuid,
  completion_source public.completion_source,
  xp_amount integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_goal record;
  v_timezone text;
  v_as_of date;
  v_credit_end date;
  v_target integer;
  v_interval public.recurrence_interval;
begin
  if p_user_id is null or p_goal_id is null then
    return;
  end if;

  select
    g.id,
    g.start_date,
    g.end_date,
    g.frequency_type,
    g.recurrence_interval,
    g.target_count,
    g.archived_at,
    g.is_deleted,
    g.category_key
  into v_goal
  from public.goals g
  where g.id = p_goal_id;

  if not found or v_goal.is_deleted then
    return;
  end if;

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = p_user_id;

  v_as_of := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  if v_goal.archived_at is not null then
    v_as_of := least(
      v_as_of,
      (v_goal.archived_at at time zone coalesce(v_timezone, 'UTC'))::date
    );
  end if;

  v_credit_end := least(v_as_of, coalesce(v_goal.end_date, v_as_of));
  if v_credit_end < v_goal.start_date then
    return;
  end if;

  if v_goal.frequency_type = 'fixed_milestones'::public.goal_frequency_type then
    v_target := greatest(1, coalesce(v_goal.target_count, 1));

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      ('completion:' || credited.completion_id::text)::text as source_key,
      v_goal.category_key::text as track_key,
      'completion_credit'::text as event_type,
      credited.completed_on as earned_on,
      credited.completion_id,
      credited.completion_source,
      private.xp_points_for_completion_source(credited.completion_source) as xp_amount
    from credited
    order by credited.ordinal asc;

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      'achievement'::text as source_key,
      v_goal.category_key::text as track_key,
      'goal_achievement'::text as event_type,
      pg_catalog.max(credited.completed_on) as earned_on,
      null::uuid as completion_id,
      null::public.completion_source as completion_source,
      private.xp_goal_achievement_points() as xp_amount
    from credited
    having pg_catalog.count(*) >= v_target;

    return;
  end if;

  if (
    v_goal.frequency_type = 'recurring'::public.goal_frequency_type
    and coalesce(v_goal.target_count, 0) > 0
  ) then
    v_target := greatest(1, coalesce(v_goal.target_count, 1));

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      ('completion:' || credited.completion_id::text)::text as source_key,
      v_goal.category_key::text as track_key,
      'completion_credit'::text as event_type,
      credited.completed_on as earned_on,
      credited.completion_id,
      credited.completion_source,
      private.xp_points_for_completion_source(credited.completion_source) as xp_amount
    from credited
    order by credited.ordinal asc;

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      'achievement'::text as source_key,
      v_goal.category_key::text as track_key,
      'goal_achievement'::text as event_type,
      pg_catalog.max(credited.completed_on) as earned_on,
      null::uuid as completion_id,
      null::public.completion_source as completion_source,
      private.xp_goal_achievement_points() as xp_amount
    from credited
    having pg_catalog.count(*) >= v_target;

    return;
  end if;

  v_interval := coalesce(v_goal.recurrence_interval, 'daily'::public.recurrence_interval);

  return query
  with admissible as (
    select
      c.id as completion_id,
      c.completed_on,
      c.source as completion_source,
      private.goal_period_key(v_goal.start_date, v_interval, c.completed_on) as period_key
    from public.completions c
    where c.user_id = p_user_id
      and c.goal_id = p_goal_id
      and c.completed_on between v_goal.start_date and v_credit_end
  ),
  credited as (
    select distinct on (a.period_key)
      a.completion_id,
      a.completed_on,
      a.completion_source,
      a.period_key
    from admissible a
    order by a.period_key asc, a.completed_on asc, a.completion_id asc
  )
  select
    ('completion:' || credited.completion_id::text)::text as source_key,
    v_goal.category_key::text as track_key,
    'completion_credit'::text as event_type,
    credited.completed_on as earned_on,
    credited.completion_id,
    credited.completion_source,
    private.xp_points_for_completion_source(credited.completion_source) as xp_amount
  from credited
  order by credited.period_key asc;
end;
$$;
