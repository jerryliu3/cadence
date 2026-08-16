-- Add manual planner items that persist across publishes, remain locked,
-- and bypass goal target-cap validation.

alter table public.planner_items
  add column if not exists goal_date_slot smallint
  generated always as (
    case
      when unit_key like 'manual:%' then 1::smallint
      else 0::smallint
    end
  ) stored;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'planner_items_goal_date_unique'
      and conrelid = 'public.planner_items'::regclass
  ) then
    alter table public.planner_items
      drop constraint planner_items_goal_date_unique;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'planner_items_goal_date_unique'
      and conrelid = 'public.planner_items'::regclass
  ) then
    alter table public.planner_items
      add constraint planner_items_goal_date_unique
      unique (goal_id, scheduled_date, goal_date_slot)
      deferrable initially immediate;
  end if;
end;
$$;

create or replace function private.planner_window_is_replay(
  p_owner_id uuid,
  p_start date,
  p_end date,
  p_items jsonb
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with schedule_input as (
    select
      row.goal_id,
      btrim(row.unit_key) as unit_key,
      row.scheduled_date,
      coalesce(row.original_scheduled_date, row.scheduled_date) as original_scheduled_date,
      nullif(btrim(row.scheduled_time), '') as scheduled_time,
      case
        when btrim(row.unit_key) like 'manual:%' then true
        else coalesce(row.locked, false)
      end as locked
    from jsonb_to_recordset(p_items) as row(
      goal_id uuid,
      unit_key text,
      scheduled_date date,
      original_scheduled_date date,
      scheduled_time text,
      locked boolean
    )
  ),
  existing_window as (
    select
      item.goal_id,
      item.unit_key,
      item.scheduled_date,
      coalesce(item.original_scheduled_date, item.scheduled_date) as original_scheduled_date,
      item.scheduled_time,
      item.locked
    from public.planner_items item
    where item.owner_id = p_owner_id
      and item.scheduled_date >= p_start
      and item.scheduled_date <= p_end
  )
  select not exists (
    (table schedule_input except table existing_window)
    union all
    (table existing_window except table schedule_input)
  );
$$;

create or replace function public.set_planner_schedule(
  p_start date,
  p_end date,
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
  v_is_replay boolean := false;
  v_upserted_count integer := 0;
  v_has_invalid_unit_key boolean := false;
  v_has_invalid_scheduled_time boolean := false;
  v_has_window_mismatch boolean := false;
  v_has_duplicate_goal_unit boolean := false;
  v_has_duplicate_goal_date boolean := false;
  v_has_unknown_goal boolean := false;
  v_has_lifetime_violation boolean := false;
  v_has_target_cap_violation boolean := false;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  perform private.assert_planner_schedule_window(p_start, p_end);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_schedule_payload';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  with schedule_input as (
    select
      row.goal_id,
      btrim(row.unit_key) as unit_key,
      row.scheduled_date,
      coalesce(row.original_scheduled_date, row.scheduled_date) as original_scheduled_date,
      nullif(btrim(row.scheduled_time), '') as scheduled_time,
      case
        when btrim(row.unit_key) like 'manual:%' then true
        else coalesce(row.locked, false)
      end as locked
    from jsonb_to_recordset(p_items) as row(
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
        where char_length(unit_key) < 1 or char_length(unit_key) > 120
      ) as has_invalid_unit_key,
      exists (
        select 1
        from schedule_input
        where scheduled_time is not null
          and scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      ) as has_invalid_scheduled_time,
      exists (
        select 1
        from schedule_input
        where scheduled_date < p_start
          or scheduled_date > p_end
      ) as has_window_mismatch,
      exists (
        select 1
        from schedule_input
        group by goal_id, unit_key
        having count(*) > 1
      ) as has_duplicate_goal_unit,
      exists (
        select 1
        from schedule_input
        group by
          goal_id,
          scheduled_date,
          case when unit_key like 'manual:%' then 1 else 0 end
        having count(*) > 1
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
           or (goal.end_date is not null and item.scheduled_date > goal.end_date)
      ) as has_lifetime_violation,
      exists (
        with incoming as (
          select goal_id, count(*)::int as incoming_count
          from schedule_input
          where unit_key not like 'manual:%'
          group by goal_id
        ),
        existing_outside_window as (
          select item.goal_id, count(*)::int as existing_count
          from public.planner_items item
          where item.owner_id = v_owner
            and item.unit_key not like 'manual:%'
            and (item.scheduled_date < p_start or item.scheduled_date > p_end)
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
        left join existing_outside_window existing on existing.goal_id = goal.id
        where goal.owner_id = v_owner
          and goal.target_count is not null
          and goal.target_count > 0
          and incoming.incoming_count + coalesce(existing.existing_count, 0) > goal.target_count
      ) as has_target_cap_violation
  )
  select
    has_invalid_unit_key,
    has_invalid_scheduled_time,
    has_window_mismatch,
    has_duplicate_goal_unit,
    has_duplicate_goal_date,
    has_unknown_goal,
    has_lifetime_violation,
    has_target_cap_violation
  into
    v_has_invalid_unit_key,
    v_has_invalid_scheduled_time,
    v_has_window_mismatch,
    v_has_duplicate_goal_unit,
    v_has_duplicate_goal_date,
    v_has_unknown_goal,
    v_has_lifetime_violation,
    v_has_target_cap_violation
  from validation_flags;

  if v_has_invalid_unit_key then
    raise exception using errcode = '22023', message = 'invalid_unit_key';
  end if;
  if v_has_invalid_scheduled_time then
    raise exception using errcode = '22023', message = 'invalid_scheduled_time';
  end if;
  if v_has_window_mismatch then
    raise exception using errcode = '22023', message = 'scheduled_date_outside_window';
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
    raise exception using errcode = 'P0001', message = 'scheduled_outside_goal_lifetime';
  end if;
  if v_has_target_cap_violation then
    raise exception using errcode = 'P0001', message = 'exceeds_target_count';
  end if;

  select private.planner_window_is_replay(v_owner, p_start, p_end, p_items)
  into v_is_replay;

  if v_is_replay then
    return query
    select v_current_digest, 0;
    return;
  end if;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  delete from public.planner_items item
  where item.owner_id = v_owner
    and item.scheduled_date >= p_start
    and item.scheduled_date <= p_end;

  begin
    with schedule_input as (
      select
        row.goal_id,
        btrim(row.unit_key) as unit_key,
        row.scheduled_date,
        coalesce(row.original_scheduled_date, row.scheduled_date) as original_scheduled_date,
        nullif(btrim(row.scheduled_time), '') as scheduled_time,
        case
          when btrim(row.unit_key) like 'manual:%' then true
          else coalesce(row.locked, false)
        end as locked
      from jsonb_to_recordset(p_items) as row(
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
    v_upserted_count;
end;
$$;

create or replace function public.create_planner_manual_item(
  p_goal_id uuid,
  p_scheduled_date date,
  p_scheduled_time text,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  item_id uuid,
  unit_key text,
  scheduled_date date,
  locked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_goal_start date;
  v_goal_end date;
  v_scheduled_time text := nullif(btrim(p_scheduled_time), '');
  v_unit_key text := 'manual:' || gen_random_uuid()::text;
  v_item_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_goal_id is null then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;
  if p_scheduled_date is null then
    raise exception using errcode = '22023', message = 'scheduled_date_outside_window';
  end if;
  if v_scheduled_time is not null
    and v_scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  then
    raise exception using errcode = '22023', message = 'invalid_scheduled_time';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;
  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  select goal.start_date, goal.end_date
  into v_goal_start, v_goal_end
  from public.goals goal
  where goal.id = p_goal_id
    and goal.owner_id = v_owner
    and not goal.is_deleted;
  if not found then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;
  if p_scheduled_date < v_goal_start
    or (v_goal_end is not null and p_scheduled_date > v_goal_end)
  then
    raise exception using errcode = 'P0001', message = 'scheduled_outside_goal_lifetime';
  end if;

  begin
    insert into public.planner_items (
      owner_id,
      goal_id,
      unit_key,
      scheduled_date,
      original_scheduled_date,
      scheduled_time,
      locked
    )
    values (
      v_owner,
      p_goal_id,
      v_unit_key,
      p_scheduled_date,
      p_scheduled_date,
      v_scheduled_time,
      true
    )
    returning id into v_item_id;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'schedule_conflict';
  end;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_item_id,
    v_unit_key,
    p_scheduled_date,
    true;
end;
$$;

create or replace function public.delete_planner_manual_item(
  p_item_id uuid,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  item_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_unit_key text;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_item_id is null then
    raise exception using errcode = 'P0001', message = 'planner_item_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;
  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  select item.unit_key
  into v_unit_key
  from public.planner_items item
  where item.id = p_item_id
    and item.owner_id = v_owner
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'planner_item_not_found';
  end if;
  if v_unit_key not like 'manual:%' then
    raise exception using errcode = '22023', message = 'planner_item_not_manual';
  end if;

  delete from public.planner_items item
  where item.id = p_item_id
    and item.owner_id = v_owner;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    p_item_id;
end;
$$;

revoke execute on function public.create_planner_manual_item(
  uuid,
  date,
  text,
  text
) from public, anon;
grant execute on function public.create_planner_manual_item(
  uuid,
  date,
  text,
  text
) to authenticated, service_role;

revoke execute on function public.delete_planner_manual_item(
  uuid,
  text
) from public, anon;
grant execute on function public.delete_planner_manual_item(
  uuid,
  text
) to authenticated, service_role;
