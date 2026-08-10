-- Additive Phase 51:
-- Allow one API publish action to persist multiple scope-month payloads atomically.
-- Each scope still reuses set_planner_schedule validation and digest semantics.

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
  v_next_expected_digest text := coalesce(p_expected_digest, '');
  v_current_digest text;
  v_scope_upserted integer := 0;
  v_scope_digest text := null;
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

  for v_scope_month, v_items in
    select
      (item.payload ->> 'scope_month')::date as scope_month,
      item.payload -> 'items' as items
    from jsonb_array_elements(p_batches) with ordinality as item(payload, ordinality)
    order by item.ordinality
  loop
    v_scope_count := v_scope_count + 1;
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

  if v_scope_count = 0 then
    select public.get_planner_schedule_digest(v_owner)
    into v_current_digest;
    v_scope_digest := v_current_digest;
  end if;

  return query
  select
    coalesce(v_scope_digest, v_next_expected_digest),
    v_total_upserted,
    v_scope_count;
end;
$$;

grant execute on function public.set_planner_schedule_batch(jsonb, text) to authenticated;
