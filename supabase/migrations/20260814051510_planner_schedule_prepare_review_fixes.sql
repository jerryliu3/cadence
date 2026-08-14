-- Review hardening for atomic planner preparation:
-- - one canonical requirement-validity predicate,
-- - no relocation of identities from outside supplied windows,
-- - owner-local cleanup dates, and
-- - stable goal definitions for the duration of validation and mutation.

create or replace function private.planner_schedule_item_matches_requirement(
  p_frequency_type public.goal_frequency_type,
  p_recurrence_interval public.recurrence_interval,
  p_target_count integer,
  p_start_date date,
  p_end_date date,
  p_unit_key text,
  p_scheduled_date date
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
          'cadence:' || private.goal_period_key(
            p_start_date,
            p_recurrence_interval,
            p_scheduled_date
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
  date
) from public, anon, authenticated;

create or replace function public.prepare_planner_schedule(
  p_windows jsonb,
  p_items jsonb,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  upserted_count integer,
  deleted_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_local_today date;
  v_is_replay boolean := false;
  v_upserted_count integer := 0;
  v_deleted_count integer := 0;
  v_deleted integer := 0;
  v_window record;
  v_previous_start date := null;
  v_previous_end date := null;
  v_month_count integer := 0;
  v_has_invalid_unit_key boolean := false;
  v_has_invalid_scheduled_time boolean := false;
  v_has_window_mismatch boolean := false;
  v_has_duplicate_goal_unit boolean := false;
  v_has_duplicate_goal_date boolean := false;
  v_has_unknown_goal boolean := false;
  v_has_requirement_mismatch boolean := false;
  v_has_lifetime_violation boolean := false;
  v_has_target_cap_violation boolean := false;
  v_has_identity_outside_windows boolean := false;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_windows is null
    or pg_catalog.jsonb_typeof(p_windows) <> 'array'
    or pg_catalog.jsonb_array_length(p_windows) = 0
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_schedule_windows_payload';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_windows) as window_payload(payload)
    where pg_catalog.jsonb_typeof(window_payload.payload) <> 'object'
      or pg_catalog.jsonb_typeof(window_payload.payload -> 'start_date') <> 'string'
      or pg_catalog.jsonb_typeof(window_payload.payload -> 'end_date') <> 'string'
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_schedule_windows_payload';
  end if;

  begin
    for v_window in
      select
        (item.payload ->> 'start_date')::date as start_date,
        (item.payload ->> 'end_date')::date as end_date,
        item.ordinality
      from pg_catalog.jsonb_array_elements(p_windows)
        with ordinality as item(payload, ordinality)
      order by item.ordinality
    loop
      perform private.assert_planner_schedule_window(
        v_window.start_date,
        v_window.end_date
      );

      if v_previous_start is not null
        and v_window.start_date <= v_previous_start
      then
        raise exception using
          errcode = '22023',
          message = 'unordered_schedule_windows';
      end if;

      if v_previous_end is not null
        and v_window.start_date <= v_previous_end
      then
        raise exception using
          errcode = '22023',
          message = 'overlapping_schedule_windows';
      end if;

      v_month_count := v_month_count
        + (
          (
            extract(year from v_window.end_date)::integer
            - extract(year from v_window.start_date)::integer
          ) * 12
          + extract(month from v_window.end_date)::integer
          - extract(month from v_window.start_date)::integer
          + 1
        );

      if v_month_count > 24 then
        raise exception using
          errcode = '22023',
          message = 'schedule_window_month_limit_exceeded';
      end if;

      v_previous_start := v_window.start_date;
      v_previous_end := v_window.end_date;
    end loop;
  exception
    when invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow
    then
      raise exception using
        errcode = '22023',
        message = 'invalid_schedule_windows_payload';
  end;

  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_schedule_payload';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as item_payload(payload)
    where pg_catalog.jsonb_typeof(item_payload.payload) <> 'object'
      or pg_catalog.jsonb_typeof(item_payload.payload -> 'goal_id') <> 'string'
      or pg_catalog.jsonb_typeof(item_payload.payload -> 'unit_key') <> 'string'
      or pg_catalog.jsonb_typeof(item_payload.payload -> 'scheduled_date') <> 'string'
      or (
        item_payload.payload ? 'original_scheduled_date'
        and pg_catalog.jsonb_typeof(
          item_payload.payload -> 'original_scheduled_date'
        ) not in ('string', 'null')
      )
      or (
        item_payload.payload ? 'scheduled_time'
        and pg_catalog.jsonb_typeof(item_payload.payload -> 'scheduled_time')
          not in ('string', 'null')
      )
      or (
        item_payload.payload ? 'locked'
        and pg_catalog.jsonb_typeof(item_payload.payload -> 'locked')
          not in ('boolean', 'null')
      )
  ) then
    raise exception using errcode = '22023', message = 'invalid_schedule_payload';
  end if;

  begin
    perform row.goal_id, row.scheduled_date, row.original_scheduled_date
    from pg_catalog.jsonb_to_recordset(p_items) as row(
      goal_id uuid,
      scheduled_date date,
      original_scheduled_date date
    );
  exception
    when invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow
    then
      raise exception using errcode = '22023', message = 'invalid_schedule_payload';
  end;

  -- Lock ordering is owner advisory lock first, then relevant owner goal rows
  -- in UUID order. update_goal takes FOR UPDATE on one goal and does not take
  -- this advisory lock, so it cannot form the inverse half of a deadlock.
  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  perform goal.id
  from public.goals goal
  where goal.owner_id = v_owner
    and (
      exists (
        select 1
        from public.planner_items existing
        where existing.goal_id = goal.id
          and existing.owner_id = v_owner
      )
      or exists (
        select 1
        from pg_catalog.jsonb_to_recordset(p_items) as incoming(goal_id uuid)
        where incoming.goal_id = goal.id
      )
    )
  order by goal.id
  for update;

  select private.local_today_for_timezone(
    coalesce(
      (
        select profile.timezone
        from public.profiles profile
        where profile.id = v_owner
      ),
      'UTC'
    )
  )
  into v_local_today;

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  with schedule_input as (
    select
      row.goal_id,
      pg_catalog.btrim(row.unit_key) as unit_key,
      row.scheduled_date,
      coalesce(row.original_scheduled_date, row.scheduled_date)
        as original_scheduled_date,
      nullif(pg_catalog.btrim(row.scheduled_time), '') as scheduled_time,
      coalesce(row.locked, false) as locked
    from pg_catalog.jsonb_to_recordset(p_items) as row(
      goal_id uuid,
      unit_key text,
      scheduled_date date,
      original_scheduled_date date,
      scheduled_time text,
      locked boolean
    )
  ),
  validation_flags as (
    select
      exists (
        select 1
        from schedule_input
        where pg_catalog.char_length(unit_key) < 1
          or pg_catalog.char_length(unit_key) > 120
      ) as has_invalid_unit_key,
      exists (
        select 1
        from schedule_input
        where scheduled_time is not null
          and scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      ) as has_invalid_scheduled_time,
      exists (
        select 1
        from schedule_input item
        where not exists (
          select 1
          from pg_catalog.jsonb_to_recordset(p_windows) as window_row(
            start_date date,
            end_date date
          )
          where item.scheduled_date >= window_row.start_date
            and item.scheduled_date <= window_row.end_date
        )
      ) as has_window_mismatch,
      exists (
        select 1
        from schedule_input
        group by goal_id, unit_key
        having pg_catalog.count(*) > 1
      ) as has_duplicate_goal_unit,
      exists (
        select 1
        from schedule_input
        group by goal_id, scheduled_date
        having pg_catalog.count(*) > 1
      ) as has_duplicate_goal_date,
      exists (
        select 1
        from schedule_input item
        left join public.goals goal on goal.id = item.goal_id
        where goal.id is null
          or goal.owner_id <> v_owner
          or goal.is_deleted
      ) as has_unknown_goal,
      exists (
        select 1
        from schedule_input item
        join public.goals goal on goal.id = item.goal_id
        where item.scheduled_date < goal.start_date
          or (
            goal.end_date is not null
            and item.scheduled_date > goal.end_date
          )
      ) as has_lifetime_violation,
      exists (
        with incoming as (
          select goal_id, pg_catalog.count(*)::integer as incoming_count
          from schedule_input
          group by goal_id
        ),
        existing_valid_outside_windows as (
          select
            existing.goal_id,
            pg_catalog.count(*)::integer as existing_count
          from public.planner_items existing
          join public.goals goal on goal.id = existing.goal_id
          where existing.owner_id = v_owner
            and not goal.is_deleted
            and not exists (
              select 1
              from pg_catalog.jsonb_to_recordset(p_windows) as window_row(
                start_date date,
                end_date date
              )
              where existing.scheduled_date >= window_row.start_date
                and existing.scheduled_date <= window_row.end_date
            )
            and private.planner_schedule_item_matches_requirement(
              goal.frequency_type,
              goal.recurrence_interval,
              goal.target_count,
              goal.start_date,
              goal.end_date,
              existing.unit_key,
              existing.scheduled_date
            )
          group by existing.goal_id
        )
        select 1
        from public.goals goal
        join incoming on incoming.goal_id = goal.id
        left join existing_valid_outside_windows existing
          on existing.goal_id = goal.id
        where goal.owner_id = v_owner
          and goal.target_count is not null
          and goal.target_count > 0
          and (
            incoming.incoming_count + coalesce(existing.existing_count, 0)
              > goal.target_count
            or exists (
              select 1
              from schedule_input item
              where item.goal_id = goal.id
                and (
                  (
                    goal.frequency_type = 'fixed_milestones'
                    and item.unit_key ~ '^milestone:[1-9][0-9]*$'
                    and substring(
                      item.unit_key from '^milestone:([1-9][0-9]*)$'
                    )::numeric > goal.target_count
                  )
                  or (
                    goal.frequency_type = 'recurring'
                    and item.unit_key ~ '^total:[1-9][0-9]*$'
                    and substring(
                      item.unit_key from '^total:([1-9][0-9]*)$'
                    )::numeric > goal.target_count
                  )
                )
            )
          )
      ) as has_target_cap_violation,
      exists (
        select 1
        from schedule_input item
        join public.goals goal on goal.id = item.goal_id
        where goal.owner_id = v_owner
          and not goal.is_deleted
          and item.scheduled_date >= goal.start_date
          and (goal.end_date is null or item.scheduled_date <= goal.end_date)
          and not private.planner_schedule_item_matches_requirement(
            goal.frequency_type,
            goal.recurrence_interval,
            goal.target_count,
            goal.start_date,
            goal.end_date,
            item.unit_key,
            item.scheduled_date
          )
      ) as has_requirement_mismatch,
      exists (
        select 1
        from schedule_input incoming
        join public.planner_items existing
          on existing.goal_id = incoming.goal_id
         and existing.unit_key = incoming.unit_key
        where existing.owner_id = v_owner
          and not exists (
            select 1
            from pg_catalog.jsonb_to_recordset(p_windows) as window_row(
              start_date date,
              end_date date
            )
            where existing.scheduled_date >= window_row.start_date
              and existing.scheduled_date <= window_row.end_date
          )
      ) as has_identity_outside_windows
  )
  select
    has_invalid_unit_key,
    has_invalid_scheduled_time,
    has_window_mismatch,
    has_duplicate_goal_unit,
    has_duplicate_goal_date,
    has_unknown_goal,
    has_requirement_mismatch,
    has_lifetime_violation,
    has_target_cap_violation,
    has_identity_outside_windows
  into
    v_has_invalid_unit_key,
    v_has_invalid_scheduled_time,
    v_has_window_mismatch,
    v_has_duplicate_goal_unit,
    v_has_duplicate_goal_date,
    v_has_unknown_goal,
    v_has_requirement_mismatch,
    v_has_lifetime_violation,
    v_has_target_cap_violation,
    v_has_identity_outside_windows
  from validation_flags;

  if v_has_invalid_unit_key then
    raise exception using errcode = '22023', message = 'invalid_unit_key';
  end if;
  if v_has_invalid_scheduled_time then
    raise exception using errcode = '22023', message = 'invalid_scheduled_time';
  end if;
  if v_has_window_mismatch then
    raise exception using
      errcode = '22023',
      message = 'scheduled_date_outside_windows';
  end if;
  if v_has_duplicate_goal_unit then
    raise exception using errcode = '22023', message = 'duplicate_goal_unit';
  end if;
  if v_has_duplicate_goal_date then
    raise exception using errcode = '22023', message = 'duplicate_goal_date';
  end if;
  if v_has_unknown_goal then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;
  if v_has_lifetime_violation then
    raise exception using
      errcode = 'P0001',
      message = 'scheduled_outside_goal_lifetime';
  end if;
  if v_has_target_cap_violation then
    raise exception using errcode = 'P0001', message = 'exceeds_target_count';
  end if;
  if v_has_requirement_mismatch then
    raise exception using errcode = '22023', message = 'invalid_goal_unit';
  end if;
  if v_has_identity_outside_windows then
    raise exception using
      errcode = 'P0001',
      message = 'schedule_identity_outside_windows';
  end if;

  with schedule_input as (
    select
      row.goal_id,
      pg_catalog.btrim(row.unit_key) as unit_key,
      row.scheduled_date,
      coalesce(row.original_scheduled_date, row.scheduled_date)
        as original_scheduled_date,
      nullif(pg_catalog.btrim(row.scheduled_time), '') as scheduled_time,
      coalesce(row.locked, false) as locked
    from pg_catalog.jsonb_to_recordset(p_items) as row(
      goal_id uuid,
      unit_key text,
      scheduled_date date,
      original_scheduled_date date,
      scheduled_time text,
      locked boolean
    )
  ),
  existing_windows as (
    select
      item.goal_id,
      item.unit_key,
      item.scheduled_date,
      coalesce(item.original_scheduled_date, item.scheduled_date)
        as original_scheduled_date,
      item.scheduled_time,
      item.locked
    from public.planner_items item
    where item.owner_id = v_owner
      and exists (
        select 1
        from pg_catalog.jsonb_to_recordset(p_windows) as window_row(
          start_date date,
          end_date date
        )
        where item.scheduled_date >= window_row.start_date
          and item.scheduled_date <= window_row.end_date
      )
  ),
  stale_future as (
    select 1
    from public.planner_items item
    join public.goals goal on goal.id = item.goal_id
    where item.owner_id = v_owner
      and item.scheduled_date >= v_local_today
      and (
        goal.is_deleted
        or not private.planner_schedule_item_matches_requirement(
          goal.frequency_type,
          goal.recurrence_interval,
          goal.target_count,
          goal.start_date,
          goal.end_date,
          item.unit_key,
          item.scheduled_date
        )
      )
    limit 1
  )
  select
    not exists (
      (table schedule_input except table existing_windows)
      union all
      (table existing_windows except table schedule_input)
    )
    and not exists (select 1 from stale_future)
  into v_is_replay;

  if v_is_replay then
    return query
    select v_current_digest, 0, 0, true;
    return;
  end if;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  delete from public.planner_items item
  where item.owner_id = v_owner
    and exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_windows) as window_row(
        start_date date,
        end_date date
      )
      where item.scheduled_date >= window_row.start_date
        and item.scheduled_date <= window_row.end_date
    );
  get diagnostics v_deleted_count = row_count;

  delete from public.planner_items item
  using public.goals goal
  where item.goal_id = goal.id
    and item.owner_id = v_owner
    and item.scheduled_date >= v_local_today
    and (
      goal.is_deleted
      or not private.planner_schedule_item_matches_requirement(
        goal.frequency_type,
        goal.recurrence_interval,
        goal.target_count,
        goal.start_date,
        goal.end_date,
        item.unit_key,
        item.scheduled_date
      )
    );
  get diagnostics v_deleted = row_count;
  v_deleted_count := v_deleted_count + v_deleted;

  begin
    with schedule_input as (
      select
        row.goal_id,
        pg_catalog.btrim(row.unit_key) as unit_key,
        row.scheduled_date,
        coalesce(row.original_scheduled_date, row.scheduled_date)
          as original_scheduled_date,
        nullif(pg_catalog.btrim(row.scheduled_time), '') as scheduled_time,
        coalesce(row.locked, false) as locked
      from pg_catalog.jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    insert into public.planner_items (
      owner_id,
      goal_id,
      unit_key,
      scheduled_date,
      original_scheduled_date,
      scheduled_time,
      locked
    )
    select
      v_owner,
      item.goal_id,
      item.unit_key,
      item.scheduled_date,
      item.original_scheduled_date,
      item.scheduled_time,
      item.locked
    from schedule_input item
    on conflict (goal_id, unit_key)
    do update
    set
      owner_id = excluded.owner_id,
      scheduled_date = excluded.scheduled_date,
      original_scheduled_date = excluded.original_scheduled_date,
      scheduled_time = excluded.scheduled_time,
      locked = excluded.locked;

    get diagnostics v_upserted_count = row_count;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'schedule_conflict';
  end;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_upserted_count,
    v_deleted_count,
    false;
end;
$$;

revoke all
on function public.prepare_planner_schedule(jsonb, jsonb, text)
from public, anon;

grant execute
on function public.prepare_planner_schedule(jsonb, jsonb, text)
to authenticated, service_role;
