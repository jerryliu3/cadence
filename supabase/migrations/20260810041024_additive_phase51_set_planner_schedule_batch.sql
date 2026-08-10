-- Additive Phase 51:
-- Allow one API publish action to persist multiple scope-month payloads atomically.
-- Each scope still reuses set_planner_schedule validation and digest semantics.

create or replace function private.planner_scope_is_replay(
  p_owner_id uuid,
  p_month date,
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
  existing_scope as (
    select
      item.goal_id,
      item.unit_key,
      item.scheduled_date,
      coalesce(item.original_scheduled_date, item.scheduled_date) as original_scheduled_date,
      item.scheduled_time,
      item.locked
    from public.planner_items item
    where item.owner_id = p_owner_id
      and date_trunc('month', item.scheduled_date)::date = p_month
  )
  select not exists (
    (table schedule_input except table existing_scope)
    union all
    (table existing_scope except table schedule_input)
  );
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
  v_scope_replay boolean := false;
  v_all_replay boolean := true;
  v_scope_month date;
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
      scope_month date,
      items jsonb
    )
    where scope_month is null
      or extract(day from scope_month) <> 1
      or items is null
      or jsonb_typeof(items) <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'invalid_schedule_batch_payload';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_batches) as item(
      scope_month date,
      items jsonb
    )
    group by item.scope_month
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_scope_month';
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

  for v_scope_month, v_items in
    select
      (item.payload ->> 'scope_month')::date as scope_month,
      item.payload -> 'items' as items
    from jsonb_array_elements(p_batches) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    v_scope_count := v_scope_count + 1;
    select private.planner_scope_is_replay(v_owner, v_scope_month, v_items)
    into v_scope_replay;
    if not v_scope_replay then
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

  for v_scope_month, v_items in
    select
      (item.payload ->> 'scope_month')::date as scope_month,
      item.payload -> 'items' as items
    from jsonb_array_elements(p_batches) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    select scoped.schedule_digest, scoped.upserted_count
    into v_scope_digest, v_scope_upserted
    from public.set_planner_schedule(
      v_scope_month,
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

grant execute on function public.set_planner_schedule_batch(jsonb, text) to authenticated;
