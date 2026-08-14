-- Align persisted cadence identities with planner calendar periods rather than
-- XP goal-anchored periods. The profile week start is read once by preparation
-- and passed through every canonical requirement-validity check.

create or replace function private.planner_cadence_period_key(
  p_recurrence_interval public.recurrence_interval,
  p_scheduled_date date,
  p_week_starts_on smallint
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_recurrence_interval is null or p_scheduled_date is null then null
    when p_recurrence_interval = 'daily'::public.recurrence_interval
      then p_scheduled_date::text
    when p_recurrence_interval = 'weekly'::public.recurrence_interval
      then (
        p_scheduled_date - (
          (
            extract(dow from p_scheduled_date)::integer
            - case
                when p_week_starts_on between 0 and 6
                  then p_week_starts_on::integer
                else 1
              end
            + 7
          ) % 7
        )
      )::text
    when p_recurrence_interval = 'monthly'::public.recurrence_interval
      then pg_catalog.date_trunc('month', p_scheduled_date)::date::text
    else null
  end;
$$;

revoke all on function private.planner_cadence_period_key(
  public.recurrence_interval,
  date,
  smallint
) from public, anon, authenticated;

create or replace function private.planner_schedule_item_matches_requirement(
  p_frequency_type public.goal_frequency_type,
  p_recurrence_interval public.recurrence_interval,
  p_target_count integer,
  p_start_date date,
  p_end_date date,
  p_unit_key text,
  p_scheduled_date date,
  p_week_starts_on smallint
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_frequency_type is not null
    and p_start_date is not null
    and p_unit_key is not null
    and p_scheduled_date is not null
    and p_scheduled_date >= p_start_date
    and (p_end_date is null or p_scheduled_date <= p_end_date)
    and (
      (
        p_frequency_type = 'fixed_milestones'::public.goal_frequency_type
        and coalesce(p_target_count, 0) > 0
        and p_unit_key ~ '^milestone:[1-9][0-9]*$'
        and substring(
          p_unit_key from '^milestone:([1-9][0-9]*)$'
        )::numeric <= p_target_count
      )
      or (
        p_frequency_type = 'recurring'::public.goal_frequency_type
        and coalesce(p_target_count, 0) > 0
        and p_unit_key ~ '^total:[1-9][0-9]*$'
        and substring(
          p_unit_key from '^total:([1-9][0-9]*)$'
        )::numeric <= p_target_count
      )
      or (
        p_frequency_type = 'recurring'::public.goal_frequency_type
        and coalesce(p_target_count, 0) <= 0
        and p_recurrence_interval is not null
        and p_unit_key = (
          'cadence:' || private.planner_cadence_period_key(
            p_recurrence_interval,
            p_scheduled_date,
            p_week_starts_on
          )
        )
      )
    );
$$;

revoke all on function private.planner_schedule_item_matches_requirement(
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  date,
  date,
  text,
  date,
  smallint
) from public, anon, authenticated;

-- Recreate the immediately preceding RPC definition with the profile week
-- start captured once and supplied to all four requirement checks. Deriving
-- from pg_get_functiondef keeps this additive migration focused on the changed
-- dependency while preserving the reviewed RPC body byte-for-byte otherwise.
do $migration$
declare
  v_definition text;
  v_old_call_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.prepare_planner_schedule(jsonb,jsonb,text)'::regprocedure
  )
  into v_definition;

  v_old_call_count := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(
        pg_catalog.replace(
          v_definition,
          'private.planner_schedule_item_matches_requirement(',
          ''
        )
      )
  ) / pg_catalog.length('private.planner_schedule_item_matches_requirement(');

  if v_old_call_count <> 4 then
    raise exception using
      errcode = '55000',
      message = 'unexpected_prepare_requirement_call_count';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    '  v_local_today date;',
    '  v_local_today date;
  v_week_starts_on smallint;'
  );

  v_definition := pg_catalog.replace(
    v_definition,
    '  select private.local_today_for_timezone(
    coalesce(
      (
        select profile.timezone
        from public.profiles profile
        where profile.id = v_owner
      ),
      ''UTC''
    )
  )
  into v_local_today;',
    '  select
    private.local_today_for_timezone(coalesce(profile.timezone, ''UTC'')),
    profile.week_starts_on
  into v_local_today, v_week_starts_on
  from public.profiles profile
  where profile.id = v_owner;

  v_week_starts_on := coalesce(v_week_starts_on, 1);'
  );

  v_definition := pg_catalog.replace(
    v_definition,
    '              existing.scheduled_date
            )',
    '              existing.scheduled_date,
              v_week_starts_on
            )'
  );

  v_definition := pg_catalog.replace(
    v_definition,
    '            item.scheduled_date
          )',
    '            item.scheduled_date,
            v_week_starts_on
          )'
  );

  v_definition := pg_catalog.replace(
    v_definition,
    '        item.scheduled_date
      )',
    '        item.scheduled_date,
        v_week_starts_on
      )'
  );

  v_definition := pg_catalog.replace(
    v_definition,
    '          item.scheduled_date
        )',
    '          item.scheduled_date,
          v_week_starts_on
        )'
  );

  execute v_definition;
end;
$migration$;

drop function private.planner_schedule_item_matches_requirement(
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  date,
  date,
  text,
  date
);

revoke all
on function public.prepare_planner_schedule(jsonb, jsonb, text)
from public, anon;

grant execute
on function public.prepare_planner_schedule(jsonb, jsonb, text)
to authenticated, service_role;
