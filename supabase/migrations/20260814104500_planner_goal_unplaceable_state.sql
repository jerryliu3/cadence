create table if not exists public.planner_goal_unplaceable (
  owner_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  requirement_fingerprint text not null,
  policy_revision integer not null,
  effective_span_end date not null,
  unplaced_count integer not null check (unplaced_count >= 0),
  reason text not null check (reason in ('capacity', 'invalid_lock')),
  computed_at timestamptz not null default now(),
  primary key (owner_id, goal_id)
);

alter table public.planner_goal_unplaceable enable row level security;

drop policy if exists planner_goal_unplaceable_select_own
on public.planner_goal_unplaceable;

create policy planner_goal_unplaceable_select_own
on public.planner_goal_unplaceable
for select
to authenticated
using (auth.uid() = owner_id);

revoke insert, update, delete
on table public.planner_goal_unplaceable
from anon;

revoke insert, update, delete
on table public.planner_goal_unplaceable
from authenticated;

grant select
on table public.planner_goal_unplaceable
to authenticated;

alter function public.prepare_planner_schedule(jsonb, jsonb, text)
rename to prepare_planner_schedule_core;

revoke all
on function public.prepare_planner_schedule_core(jsonb, jsonb, text)
from public, anon, authenticated;

grant execute
on function public.prepare_planner_schedule_core(jsonb, jsonb, text)
to service_role;

drop function if exists public.prepare_planner_schedule(jsonb, jsonb, text, jsonb);

create or replace function public.prepare_planner_schedule(
  p_windows jsonb,
  p_items jsonb,
  p_expected_digest text,
  p_unplaceable jsonb default '[]'::jsonb
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
  v_result record;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_unplaceable is null or pg_catalog.jsonb_typeof(p_unplaceable) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_unplaceable_payload';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_unplaceable) as payload(row)
    where pg_catalog.jsonb_typeof(payload.row) <> 'object'
      or pg_catalog.jsonb_typeof(payload.row -> 'goal_id') <> 'string'
      or pg_catalog.jsonb_typeof(payload.row -> 'requirement_fingerprint') <> 'string'
      or pg_catalog.jsonb_typeof(payload.row -> 'policy_revision') <> 'number'
      or pg_catalog.jsonb_typeof(payload.row -> 'effective_span_end') <> 'string'
      or pg_catalog.jsonb_typeof(payload.row -> 'unplaced_count') <> 'number'
      or pg_catalog.jsonb_typeof(payload.row -> 'reason') <> 'string'
      or (
        payload.row ? 'computed_at'
        and pg_catalog.jsonb_typeof(payload.row -> 'computed_at') not in ('string', 'null')
      )
  ) then
    raise exception using errcode = '22023', message = 'invalid_unplaceable_payload';
  end if;

  begin
    perform row.goal_id, row.policy_revision, row.effective_span_end, row.unplaced_count
    from pg_catalog.jsonb_to_recordset(p_unplaceable) as row(
      goal_id uuid,
      policy_revision integer,
      effective_span_end date,
      unplaced_count integer
    );
  exception
    when invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow
    then
      raise exception using errcode = '22023', message = 'invalid_unplaceable_payload';
  end;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_unplaceable) as row(
      goal_id uuid,
      unplaced_count integer,
      reason text
    )
    where row.unplaced_count < 0
      or row.reason not in ('capacity', 'invalid_lock')
  ) then
    raise exception using errcode = '22023', message = 'invalid_unplaceable_payload';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_unplaceable) as row(goal_id uuid)
    group by row.goal_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'duplicate_unplaceable_goal';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_unplaceable) as row(goal_id uuid)
    left join public.goals goal on goal.id = row.goal_id
    where goal.id is null
      or goal.owner_id <> v_owner
      or goal.is_deleted
  ) then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;

  select *
  into v_result
  from public.prepare_planner_schedule_core(
    p_windows => p_windows,
    p_items => p_items,
    p_expected_digest => p_expected_digest
  );

  with unplaceable_input as (
    select
      row.goal_id,
      pg_catalog.btrim(row.requirement_fingerprint) as requirement_fingerprint,
      row.policy_revision,
      row.effective_span_end,
      row.unplaced_count,
      row.reason,
      row.computed_at
    from pg_catalog.jsonb_to_recordset(p_unplaceable) as row(
      goal_id uuid,
      requirement_fingerprint text,
      policy_revision integer,
      effective_span_end date,
      unplaced_count integer,
      reason text,
      computed_at timestamptz
    )
  )
  insert into public.planner_goal_unplaceable (
    owner_id,
    goal_id,
    requirement_fingerprint,
    policy_revision,
    effective_span_end,
    unplaced_count,
    reason,
    computed_at
  )
  select
    v_owner,
    input.goal_id,
    input.requirement_fingerprint,
    input.policy_revision,
    input.effective_span_end,
    input.unplaced_count,
    input.reason,
    coalesce(input.computed_at, now())
  from unplaceable_input input
  where input.unplaced_count > 0
  on conflict (owner_id, goal_id)
  do update set
    requirement_fingerprint = excluded.requirement_fingerprint,
    policy_revision = excluded.policy_revision,
    effective_span_end = excluded.effective_span_end,
    unplaced_count = excluded.unplaced_count,
    reason = excluded.reason,
    computed_at = excluded.computed_at;

  with unplaceable_input as (
    select
      row.goal_id,
      row.unplaced_count
    from pg_catalog.jsonb_to_recordset(p_unplaceable) as row(
      goal_id uuid,
      unplaced_count integer
    )
  )
  delete from public.planner_goal_unplaceable state
  where state.owner_id = v_owner
    and state.goal_id in (
      select input.goal_id
      from unplaceable_input input
      where input.unplaced_count = 0
    );

  return query
  select
    v_result.schedule_digest,
    v_result.upserted_count,
    v_result.deleted_count,
    v_result.replayed;
end;
$$;

revoke all
on function public.prepare_planner_schedule(jsonb, jsonb, text, jsonb)
from public, anon;

grant execute
on function public.prepare_planner_schedule(jsonb, jsonb, text, jsonb)
to authenticated, service_role;
