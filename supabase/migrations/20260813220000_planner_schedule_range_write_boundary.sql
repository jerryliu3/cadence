-- Widen planner schedule writes from a month bucket to an inclusive date window.
-- Publish windows are a contiguous span of whole months: p_start is day 1,
-- p_end is that span's month-end, and the inclusive length is at most 366 days.
-- Callers may still pass a single calendar month as (month-start, month-end).
-- Replay/idempotency compares the incoming snapshot to rows currently in that window.

drop function if exists public.set_planner_schedule(date, jsonb, text);
drop function if exists public.clear_planner_schedule(date, text);
drop function if exists private.planner_scope_is_replay(uuid, date, jsonb);

create or replace function private.assert_planner_schedule_window(
  p_start date,
  p_end date
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  -- Inclusive span of 366 days => (end - start) <= 365. Matches
  -- MAX_PLANNER_WINDOW_DAYS in src/lib/planner/contracts/bounds.ts.
  -- Start must be day 1 of a month; end must be the last day of its month.
  -- Cadence membership is owning-month based, so mid-month ranges are not a
  -- supported publish shape.
  if p_start is null
    or p_end is null
    or p_end < p_start
    or (p_end - p_start) > 365
    or p_start <> date_trunc('month', p_start)::date
    or p_end <> (date_trunc('month', p_end) + interval '1 month' - interval '1 day')::date
  then
    raise exception using errcode = '22023', message = 'invalid_schedule_window';
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
        group by goal_id, scheduled_date
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
          group by goal_id
        ),
        existing_outside_window as (
          select item.goal_id, count(*)::int as existing_count
          from public.planner_items item
          where item.owner_id = v_owner
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

create or replace function public.set_planner_schedule_batch(
  p_batches jsonb,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  upserted_count integer,
  scope_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_scope_count integer := 0;
  v_total_upserted integer := 0;
  v_next_expected_digest text;
  v_current_digest text;
  v_scope_upserted integer := 0;
  v_scope_digest text := null;
  v_window_replay boolean := false;
  v_all_replay boolean := true;
  v_start date;
  v_end date;
  v_items jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_batches is null or jsonb_typeof(p_batches) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_schedule_batch_payload';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_batches) as item(
      start_date date,
      end_date date,
      items jsonb
    )
    where start_date is null
      or end_date is null
      or end_date < start_date
      or (end_date - start_date) > 365
      or start_date <> date_trunc('month', start_date)::date
      or end_date <> (date_trunc('month', end_date) + interval '1 month' - interval '1 day')::date
      or items is null
      or jsonb_typeof(items) <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'invalid_schedule_batch_payload';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_batches) as item(
      start_date date,
      end_date date,
      items jsonb
    )
    group by item.start_date, item.end_date
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_schedule_window';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_batches) with ordinality as left_batch(payload, ordinality)
    join jsonb_array_elements(p_batches) with ordinality as right_batch(payload, ordinality)
      on left_batch.ordinality < right_batch.ordinality
    where (left_batch.payload ->> 'start_date')::date
        <= (right_batch.payload ->> 'end_date')::date
      and (right_batch.payload ->> 'start_date')::date
        <= (left_batch.payload ->> 'end_date')::date
  ) then
    raise exception using errcode = '22023', message = 'overlapping_schedule_windows';
  end if;
  if exists (
    with batch_item_rows as (
      select
        row.goal_id,
        btrim(row.unit_key) as unit_key
      from jsonb_array_elements(p_batches) as batch(payload)
      cross join lateral jsonb_to_recordset(batch.payload -> 'items') as row(
        goal_id uuid,
        unit_key text
      )
    )
    select 1
    from batch_item_rows
    group by goal_id, unit_key
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_goal_unit_across_scopes';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );
  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;
  v_next_expected_digest := coalesce(v_current_digest, '');

  for v_start, v_end, v_items in
    select
      (item.payload ->> 'start_date')::date as start_date,
      (item.payload ->> 'end_date')::date as end_date,
      item.payload -> 'items' as items
    from jsonb_array_elements(p_batches) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    v_scope_count := v_scope_count + 1;
    select private.planner_window_is_replay(v_owner, v_start, v_end, v_items)
    into v_window_replay;
    if not v_window_replay then
      v_all_replay := false;
    end if;
  end loop;

  if not v_all_replay
    and coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  if v_all_replay then
    v_scope_digest := v_current_digest;
    return query
    select
      coalesce(v_scope_digest, v_next_expected_digest),
      0,
      v_scope_count;
    return;
  end if;

  for v_start, v_end, v_items in
    select
      (item.payload ->> 'start_date')::date as start_date,
      (item.payload ->> 'end_date')::date as end_date,
      item.payload -> 'items' as items
    from jsonb_array_elements(p_batches) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    select scoped.schedule_digest, scoped.upserted_count
    into v_scope_digest, v_scope_upserted
    from public.set_planner_schedule(
      v_start,
      v_end,
      v_items,
      v_next_expected_digest
    ) as scoped;
    v_total_upserted := v_total_upserted + coalesce(v_scope_upserted, 0);
    v_next_expected_digest := coalesce(v_scope_digest, v_next_expected_digest);
  end loop;

  return query
  select
    coalesce(v_scope_digest, v_next_expected_digest),
    v_total_upserted,
    v_scope_count;
end;
$$;

-- Multi-window snapshot delete for reset-all. Months may be non-contiguous, so
-- this is not a single fat range. It deletes items in each listed window and
-- does not publish a replacement snapshot.

create or replace function public.clear_planner_schedule_windows(
  p_windows jsonb,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  deleted_count integer,
  window_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_window_count integer := 0;
  v_total_deleted integer := 0;
  v_deleted integer := 0;
  v_current_digest text;
  v_window_replay boolean := false;
  v_all_replay boolean := true;
  v_start date;
  v_end date;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_windows is null
    or jsonb_typeof(p_windows) <> 'array'
    or jsonb_array_length(p_windows) = 0 then
    raise exception using errcode = '22023', message = 'invalid_schedule_windows_payload';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_windows) as window_payload(payload)
    where jsonb_typeof(window_payload.payload) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'invalid_schedule_windows_payload';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_windows) as item(
      start_date date,
      end_date date
    )
    where start_date is null
      or end_date is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_schedule_windows_payload';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_windows) as item(
      start_date date,
      end_date date
    )
    group by item.start_date, item.end_date
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_schedule_window';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_windows) with ordinality as left_window(payload, ordinality)
    join jsonb_array_elements(p_windows) with ordinality as right_window(payload, ordinality)
      on left_window.ordinality < right_window.ordinality
    where (left_window.payload ->> 'start_date')::date
        <= (right_window.payload ->> 'end_date')::date
      and (right_window.payload ->> 'start_date')::date
        <= (left_window.payload ->> 'end_date')::date
  ) then
    raise exception using errcode = '22023', message = 'overlapping_schedule_windows';
  end if;

  for v_start, v_end in
    select
      (item.payload ->> 'start_date')::date,
      (item.payload ->> 'end_date')::date
    from jsonb_array_elements(p_windows) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    perform private.assert_planner_schedule_window(v_start, v_end);
    v_window_count := v_window_count + 1;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );
  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  for v_start, v_end in
    select
      (item.payload ->> 'start_date')::date,
      (item.payload ->> 'end_date')::date
    from jsonb_array_elements(p_windows) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    select private.planner_window_is_replay(v_owner, v_start, v_end, '[]'::jsonb)
    into v_window_replay;
    if not v_window_replay then
      v_all_replay := false;
    end if;
  end loop;

  if not v_all_replay
    and coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  if v_all_replay then
    return query
    select
      v_current_digest,
      0,
      v_window_count;
    return;
  end if;

  for v_start, v_end in
    select
      (item.payload ->> 'start_date')::date,
      (item.payload ->> 'end_date')::date
    from jsonb_array_elements(p_windows) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    delete from public.planner_items item
    where item.owner_id = v_owner
      and item.scheduled_date >= v_start
      and item.scheduled_date <= v_end;
    get diagnostics v_deleted = row_count;
    v_total_deleted := v_total_deleted + coalesce(v_deleted, 0);
  end loop;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_total_deleted,
    v_window_count;
end;
$$;

create or replace function public.clear_planner_schedule(
  p_start date,
  p_end date,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  unlocked_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_current_digest text;
  v_planner_items_unlocked_count integer := 0;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  perform private.assert_planner_schedule_window(p_start, p_end);

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  update public.planner_items item
  set locked = false
  where item.owner_id = v_owner
    and item.scheduled_date >= p_start
    and item.scheduled_date <= p_end
    and item.locked;

  get diagnostics v_planner_items_unlocked_count = row_count;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_planner_items_unlocked_count;
end;
$$;

revoke all on function public.set_planner_schedule(date, date, jsonb, text) from public;
revoke all on function public.set_planner_schedule_batch(jsonb, text) from public;
revoke all on function public.clear_planner_schedule_windows(jsonb, text) from public;
revoke all on function public.clear_planner_schedule(date, date, text) from public;

grant execute on function public.set_planner_schedule(date, date, jsonb, text) to authenticated;
grant execute on function public.set_planner_schedule_batch(jsonb, text) to authenticated;
grant execute on function public.clear_planner_schedule_windows(jsonb, text) to authenticated;
grant execute on function public.clear_planner_schedule(date, date, text) to authenticated;
