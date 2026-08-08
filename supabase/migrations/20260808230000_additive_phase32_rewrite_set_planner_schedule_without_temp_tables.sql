-- Additive Phase 32:
-- Rewrite planner schedule write path to avoid per-call temp tables.

create or replace function public.set_planner_schedule(
  p_month date,
  p_items jsonb,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  upserted_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_upserted_count integer := 0;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_schedule_payload';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  if exists (
    with schedule_input as (
      select
        row.goal_id,
        btrim(row.unit_key) as unit_key,
        row.scheduled_date,
        coalesce(row.original_scheduled_date, row.scheduled_date) as original_scheduled_date,
        nullif(btrim(row.scheduled_time), '') as scheduled_time,
        coalesce(row.locked, false) as locked
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input
    where char_length(unit_key) < 1 or char_length(unit_key) > 120
  ) then
    raise exception using errcode = '22023', message = 'invalid_unit_key';
  end if;

  if exists (
    with schedule_input as (
      select
        nullif(btrim(row.scheduled_time), '') as scheduled_time
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input
    where scheduled_time is not null
      and scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception using errcode = '22023', message = 'invalid_scheduled_time';
  end if;

  if exists (
    with schedule_input as (
      select row.scheduled_date
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input
    where date_trunc('month', scheduled_date)::date <> p_month
  ) then
    raise exception using errcode = '22023', message = 'scheduled_date_outside_scope_month';
  end if;

  if exists (
    with schedule_input as (
      select
        row.goal_id,
        btrim(row.unit_key) as unit_key
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input
    group by goal_id, unit_key
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_goal_unit';
  end if;

  if exists (
    with schedule_input as (
      select
        row.goal_id,
        row.scheduled_date
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input
    group by goal_id, scheduled_date
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_goal_date';
  end if;

  if exists (
    with schedule_input as (
      select row.goal_id
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input item
    left join public.goals goal on goal.id = item.goal_id
    where goal.id is null
      or goal.owner_id <> v_owner
      or goal.is_deleted
  ) then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;

  if exists (
    with schedule_input as (
      select
        row.goal_id,
        row.scheduled_date
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    )
    select 1
    from schedule_input item
    join public.goals goal on goal.id = item.goal_id
    where item.scheduled_date < goal.start_date
       or (goal.end_date is not null and item.scheduled_date > goal.end_date)
  ) then
    raise exception using errcode = 'P0001', message = 'scheduled_outside_goal_lifetime';
  end if;

  if exists (
    with schedule_input as (
      select
        row.goal_id,
        btrim(row.unit_key) as unit_key
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    ),
    incoming as (
      select goal_id, count(*)::int as incoming_count
      from schedule_input
      group by goal_id
    ),
    existing_other_month as (
      select item.goal_id, count(*)::int as existing_count
      from public.planner_items item
      where item.owner_id = v_owner
        and date_trunc('month', item.scheduled_date)::date <> p_month
        and not exists (
          select 1
          from schedule_input incoming_item
          where incoming_item.goal_id = item.goal_id
            and incoming_item.unit_key = item.unit_key
        )
      group by item.goal_id
    )
    select 1
    from public.goals goal
    join incoming on incoming.goal_id = goal.id
    left join existing_other_month existing on existing.goal_id = goal.id
    where goal.owner_id = v_owner
      and goal.target_count is not null
      and goal.target_count > 0
      and incoming.incoming_count + coalesce(existing.existing_count, 0) > goal.target_count
  ) then
    raise exception using errcode = 'P0001', message = 'exceeds_target_count';
  end if;

  begin
    with schedule_input as (
      select
        row.goal_id,
        btrim(row.unit_key) as unit_key,
        row.scheduled_date,
        coalesce(row.original_scheduled_date, row.scheduled_date) as original_scheduled_date,
        nullif(btrim(row.scheduled_time), '') as scheduled_time,
        coalesce(row.locked, false) as locked
      from jsonb_to_recordset(p_items) as row(
        goal_id uuid,
        unit_key text,
        scheduled_date date,
        original_scheduled_date date,
        scheduled_time text,
        locked boolean
      )
    ),
    deleted_scope as (
      delete from public.planner_items item
      where item.owner_id = v_owner
        and date_trunc('month', item.scheduled_date)::date = p_month
      returning item.id
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
    v_upserted_count;
end;
$$;
