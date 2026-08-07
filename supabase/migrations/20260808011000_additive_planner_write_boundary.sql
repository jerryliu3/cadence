-- Additive Phase 1 (part B):
-- Add new planner write boundary against planner_items with digest concurrency.

create or replace function public.get_planner_schedule_digest(
  p_owner uuid default auth.uid()
)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      coalesce(
        string_agg(
          format(
            '%s|%s|%s|%s|%s',
            item.goal_id::text,
            item.unit_key,
            item.scheduled_date::text,
            coalesce(item.scheduled_time, ''),
            case when item.locked then '1' else '0' end
          ),
          ',' order by item.goal_id, item.unit_key
        ),
        'empty'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.planner_items item
  where item.owner_id = p_owner;
$$;

grant execute on function public.get_planner_schedule_digest(uuid) to authenticated;

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

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  create temp table tmp_schedule_input (
    goal_id uuid not null,
    unit_key text not null,
    scheduled_date date not null,
    scheduled_time text,
    locked boolean not null
  ) on commit drop;

  insert into tmp_schedule_input (goal_id, unit_key, scheduled_date, scheduled_time, locked)
  select
    row.goal_id,
    btrim(row.unit_key),
    row.scheduled_date,
    nullif(btrim(row.scheduled_time), ''),
    coalesce(row.locked, false)
  from jsonb_to_recordset(p_items) as row(
    goal_id uuid,
    unit_key text,
    scheduled_date date,
    scheduled_time text,
    locked boolean
  );

  if exists (
    select 1
    from tmp_schedule_input
    where char_length(unit_key) < 1 or char_length(unit_key) > 120
  ) then
    raise exception using errcode = '22023', message = 'invalid_unit_key';
  end if;

  if exists (
    select 1
    from tmp_schedule_input
    where scheduled_time is not null
      and scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception using errcode = '22023', message = 'invalid_scheduled_time';
  end if;

  if exists (
    select 1
    from tmp_schedule_input
    where date_trunc('month', scheduled_date)::date <> p_month
  ) then
    raise exception using errcode = '22023', message = 'scheduled_date_outside_scope_month';
  end if;

  if exists (
    select 1
    from tmp_schedule_input
    group by goal_id, unit_key
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_goal_unit';
  end if;

  if exists (
    select 1
    from tmp_schedule_input
    group by goal_id, scheduled_date
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_goal_date';
  end if;

  if exists (
    select 1
    from tmp_schedule_input item
    left join public.goals goal on goal.id = item.goal_id
    where goal.id is null
      or goal.owner_id <> v_owner
      or goal.is_deleted
  ) then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;

  if exists (
    select 1
    from tmp_schedule_input item
    join public.goals goal on goal.id = item.goal_id
    where item.scheduled_date < goal.start_date
       or (goal.end_date is not null and item.scheduled_date > goal.end_date)
  ) then
    raise exception using errcode = 'P0001', message = 'scheduled_outside_goal_lifetime';
  end if;

  if exists (
    with incoming as (
      select goal_id, count(*)::int as incoming_count
      from tmp_schedule_input
      group by goal_id
    ),
    existing_other_month as (
      select item.goal_id, count(*)::int as existing_count
      from public.planner_items item
      where item.owner_id = v_owner
        and date_trunc('month', item.scheduled_date)::date <> p_month
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

  delete from public.planner_items
  where owner_id = v_owner
    and date_trunc('month', scheduled_date)::date = p_month;

  begin
    insert into public.planner_items (
      owner_id,
      goal_id,
      unit_key,
      scheduled_date,
      scheduled_time,
      locked
    )
    select
      v_owner,
      item.goal_id,
      item.unit_key,
      item.scheduled_date,
      item.scheduled_time,
      item.locked
    from tmp_schedule_input item
    on conflict (goal_id, unit_key)
    do update
    set
      owner_id = excluded.owner_id,
      scheduled_date = excluded.scheduled_date,
      scheduled_time = excluded.scheduled_time,
      locked = excluded.locked;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'schedule_conflict';
  end;

  get diagnostics v_upserted_count = row_count;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_upserted_count;
end;
$$;

create or replace function public.clear_planner_schedule(
  p_month date,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  deleted_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_deleted_count integer := 0;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  delete from public.planner_items
  where owner_id = v_owner
    and date_trunc('month', scheduled_date)::date = p_month;

  get diagnostics v_deleted_count = row_count;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_deleted_count;
end;
$$;

create or replace function public.set_planner_item_lock(
  p_item_id uuid,
  p_locked boolean
)
returns table (
  schedule_digest text,
  item_id uuid,
  locked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  update public.planner_items item
  set locked = p_locked
  where item.id = p_item_id
    and item.owner_id = v_owner;

  if not found then
    raise exception using errcode = 'P0001', message = 'planner_item_not_found';
  end if;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    p_item_id,
    p_locked;
end;
$$;

grant execute on function public.set_planner_schedule(date, jsonb, text) to authenticated;
grant execute on function public.clear_planner_schedule(date, text) to authenticated;
grant execute on function public.set_planner_item_lock(uuid, boolean) to authenticated;
