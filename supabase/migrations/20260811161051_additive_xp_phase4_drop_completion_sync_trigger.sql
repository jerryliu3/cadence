-- XP Phase 4 follow-up:
-- Replace completion-table XP trigger recompute with explicit RPC recompute writes.
-- Keep an optional service-role reconciliation RPC for cron backstops.

drop trigger if exists completions_xp_recompute
on public.completions;

drop function if exists private.sync_goal_xp_from_completion();

create or replace function public.mark_goal_complete(
  p_goal_id uuid,
  p_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_visited uuid[] := '{}'::uuid[];
  v_queue uuid[] := array[p_goal_id]::uuid[];
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.can_complete_goal(p_goal_id, v_uid) then
    raise exception 'not authorized for goal %', p_goal_id;
  end if;

  perform private.raise_if_future_completion_date(v_uid, p_date);

  while coalesce(array_length(v_queue, 1), 0) > 0 loop
    v_current := v_queue[1];
    v_queue := case
      when array_length(v_queue, 1) > 1 then v_queue[2:array_length(v_queue, 1)]
      else '{}'::uuid[]
    end;

    if v_current = any(v_visited) then
      continue;
    end if;

    v_visited := array_append(v_visited, v_current);

    insert into public.completions (goal_id, user_id, completed_on, source)
    values (
      v_current,
      v_uid,
      p_date,
      case
        when v_current = p_goal_id then 'manual'::public.completion_source
        else 'linked_cascade'::public.completion_source
      end
    )
    on conflict (goal_id, user_id, completed_on) do nothing;

    perform public.recompute_goal_xp_service(v_uid, v_current);

    v_queue := v_queue || coalesce(
      (
        select array_agg(gl.target_goal_id)
        from public.goal_links gl
        join public.goals source_goal on source_goal.id = gl.source_goal_id
        join public.goals target_goal on target_goal.id = gl.target_goal_id
        where gl.source_goal_id = v_current
          and gl.owner_id = v_uid
          and source_goal.owner_id = v_uid
          and target_goal.owner_id = v_uid
      ),
      '{}'::uuid[]
    );
  end loop;
end;
$$;

create or replace function public.unmark_goal_complete(
  p_goal_id uuid,
  p_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_visited uuid[] := '{}'::uuid[];
  v_queue uuid[] := array[p_goal_id]::uuid[];
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.can_complete_goal(p_goal_id, v_uid) then
    raise exception 'not authorized for goal %', p_goal_id;
  end if;

  while coalesce(array_length(v_queue, 1), 0) > 0 loop
    v_current := v_queue[1];
    v_queue := case
      when array_length(v_queue, 1) > 1 then v_queue[2:array_length(v_queue, 1)]
      else '{}'::uuid[]
    end;

    if v_current = any(v_visited) then
      continue;
    end if;

    v_visited := array_append(v_visited, v_current);

    delete from public.completions
    where goal_id = v_current
      and user_id = v_uid
      and completed_on = p_date;

    perform public.recompute_goal_xp_service(v_uid, v_current);

    v_queue := v_queue || coalesce(
      (
        select array_agg(gl.target_goal_id)
        from public.goal_links gl
        join public.goals source_goal on source_goal.id = gl.source_goal_id
        join public.goals target_goal on target_goal.id = gl.target_goal_id
        where gl.source_goal_id = v_current
          and gl.owner_id = v_uid
          and source_goal.owner_id = v_uid
          and target_goal.owner_id = v_uid
      ),
      '{}'::uuid[]
    );
  end loop;
end;
$$;

create or replace function public.set_execution_plan_goal_date_fact_service(
  p_owner uuid,
  p_plan_goal_id uuid,
  p_date date,
  p_desired_fact_state text,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint
)
returns table (
  goal_id uuid,
  date date,
  fact_state text,
  canonical_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal record;
  v_existing_completion_id uuid;
  v_target_count integer;
  v_completion_count integer;
begin
  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  perform private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  if p_desired_fact_state not in ('present', 'absent') then
    raise exception using
      errcode = '22023',
      message = 'invalid desired fact state';
  end if;

  select
    plan_goal.id,
    plan_goal.goal_id,
    plan_goal.start_date,
    plan_goal.end_date,
    plan_goal.requirement_kind,
    plan_goal.requirement_snapshot,
    plan.timezone
  into v_goal
  from public.execution_plan_goals plan_goal
  join public.execution_plans plan
    on plan.id = plan_goal.plan_id
   and plan.owner_id = plan_goal.owner_id
  where plan_goal.id = p_plan_goal_id
    and plan_goal.owner_id = p_owner
    and plan.status = 'active'
  for update of plan_goal, plan;

  if v_goal.id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner goal not found';
  end if;

  if v_goal.goal_id is null then
    raise exception using
      errcode = '23514',
      message = 'planner goal no longer has a live goal';
  end if;

  if exists (
    select 1
    from public.goal_links link
    where link.owner_id = p_owner
      and (
        link.source_goal_id = v_goal.goal_id
        or link.target_goal_id = v_goal.goal_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'linked goals cannot use planner plan-goal date facts';
  end if;

  select completion.id
  into v_existing_completion_id
  from public.completions completion
  where completion.user_id = p_owner
    and completion.goal_id = v_goal.goal_id
    and completion.completed_on = p_date
  order by completion.id
  limit 1;

  if p_desired_fact_state = 'present' then
    if p_date > private.local_today_for_timezone(v_goal.timezone) then
      raise exception using
        errcode = '23514',
        message = 'future_completion_not_allowed';
    end if;

    if p_date < v_goal.start_date
      or (v_goal.end_date is not null and p_date > v_goal.end_date) then
      raise exception using
        errcode = '23514',
        message = 'completion_outside_goal_lifetime';
    end if;

    if v_goal.requirement_kind = 'milestone_sequence'
      and v_existing_completion_id is null then
      v_target_count := greatest(
        1,
        coalesce(
          (v_goal.requirement_snapshot->'requirement'->>'targetCount')::integer,
          1
        )
      );
      select count(*)
      into v_completion_count
      from public.completions completion
      where completion.user_id = p_owner
        and completion.goal_id = v_goal.goal_id;

      if v_completion_count >= v_target_count then
        raise exception using
          errcode = '23514',
          message = 'milestone_sequence_already_complete';
      end if;
    end if;

    if v_existing_completion_id is null then
      insert into public.completions (
        id,
        goal_id,
        user_id,
        completed_on,
        source
      )
      values (
        gen_random_uuid(),
        v_goal.goal_id,
        p_owner,
        p_date,
        'manual'
      );
    end if;
  else
    delete from public.completions completion
    where completion.user_id = p_owner
      and completion.goal_id = v_goal.goal_id
      and completion.completed_on = p_date;
  end if;

  perform public.recompute_goal_xp_service(p_owner, v_goal.goal_id);

  select state.canonical_revision, state.execution_revision
  into canonical_revision, execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  goal_id := v_goal.goal_id;
  date := p_date;
  fact_state := p_desired_fact_state;
  return next;
end;
$$;

create or replace function public.set_execution_plan_item_date_fact_service(
  p_owner uuid,
  p_item_id uuid,
  p_desired_fact_state text,
  p_expected_credited_unit jsonb,
  p_expected_canonical_revision bigint,
  p_expected_execution_revision bigint,
  p_expected_item_revision bigint
)
returns table (
  item_id uuid,
  goal_id uuid,
  date date,
  fact_state text,
  canonical_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_existing_completion_id uuid;
begin
  perform pg_advisory_xact_lock(private.planner_owner_lock_key(p_owner));
  perform private.require_planner_state_revisions(
    p_owner,
    p_expected_canonical_revision,
    p_expected_execution_revision
  );

  if p_desired_fact_state not in ('present', 'absent') then
    raise exception using
      errcode = '22023',
      message = 'invalid desired fact state';
  end if;

  select
    item.id,
    item.revision,
    item.scheduled_date,
    item.classification,
    item.credited_completion_id,
    item.credited_completion_date,
    plan.timezone,
    plan_goal.goal_id,
    plan_goal.original_goal_id,
    plan_goal.requirement_fingerprint,
    item.unit_key
  into v_item
  from public.execution_plan_items item
  join public.execution_plan_goals plan_goal
    on plan_goal.id = item.plan_goal_id
   and plan_goal.plan_id = item.plan_id
   and plan_goal.owner_id = item.owner_id
  join public.execution_plans plan
    on plan.id = item.plan_id
   and plan.owner_id = item.owner_id
  where item.id = p_item_id
    and item.owner_id = p_owner
    and plan.status = 'active'
  for update of item, plan_goal, plan;

  if v_item.id is null then
    raise exception using
      errcode = '42501',
      message = 'active planner item not found';
  end if;

  if v_item.revision <> p_expected_item_revision then
    raise exception using
      errcode = '40001',
      message = 'planner item revision mismatch';
  end if;

  if v_item.goal_id is null then
    raise exception using
      errcode = '23514',
      message = 'planner item no longer has a live goal';
  end if;

  if v_item.scheduled_date is null then
    raise exception using
      errcode = '23514',
      message = 'planner item has no scheduled date';
  end if;

  if v_item.classification in (
    'historical_shortfall',
    'historical_miss',
    'satisfied_elsewhere'
  ) then
    raise exception using
      errcode = '23514',
      message = 'item state cannot accept exact-date facts';
  end if;

  if p_expected_credited_unit is null then
    if v_item.credited_completion_id is not null then
      raise exception using
        errcode = '40001',
        message = 'credited unit mismatch';
    end if;
  else
    if v_item.credited_completion_id is null
      or p_expected_credited_unit->>'goalId' <> v_item.original_goal_id::text
      or p_expected_credited_unit->>'requirementFingerprint' <> v_item.requirement_fingerprint
      or p_expected_credited_unit->>'unitKey' <> v_item.unit_key
      or p_expected_credited_unit->>'completedOn' <> v_item.credited_completion_date::text then
      raise exception using
        errcode = '40001',
        message = 'credited unit mismatch';
    end if;
  end if;

  select completion.id
  into v_existing_completion_id
  from public.completions completion
  where completion.user_id = p_owner
    and completion.goal_id = v_item.goal_id
    and completion.completed_on = v_item.scheduled_date
  order by completion.id
  limit 1;

  if p_desired_fact_state = 'present' then
    if v_item.scheduled_date > private.local_today_for_timezone(v_item.timezone) then
      raise exception using
        errcode = '23514',
        message = 'future_completion_not_allowed';
    end if;
    if v_existing_completion_id is null then
      insert into public.completions (
        id,
        goal_id,
        user_id,
        completed_on,
        source
      )
      values (
        gen_random_uuid(),
        v_item.goal_id,
        p_owner,
        v_item.scheduled_date,
        'manual'
      );
    end if;
  else
    delete from public.completions completion
    where completion.user_id = p_owner
      and completion.goal_id = v_item.goal_id
      and completion.completed_on = v_item.scheduled_date;
  end if;

  perform public.recompute_goal_xp_service(p_owner, v_item.goal_id);

  select state.canonical_revision, state.execution_revision
  into canonical_revision, execution_revision
  from private.planner_state state
  where state.owner_id = p_owner;

  item_id := v_item.id;
  goal_id := v_item.goal_id;
  date := v_item.scheduled_date;
  fact_state := p_desired_fact_state;
  return next;
end;
$$;

create or replace function public.reconcile_goal_xp_service(
  p_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_pairs integer := 0;
begin
  for r in
    select distinct pair.user_id, pair.goal_id
    from (
      select c.user_id, c.goal_id
      from public.completions c
      union
      select l.user_id, l.goal_id
      from public.xp_ledger l
      where l.goal_id is not null
    ) as pair
    where p_user_id is null or pair.user_id = p_user_id
  loop
    perform public.recompute_goal_xp_service(r.user_id, r.goal_id);
    v_pairs := v_pairs + 1;
  end loop;

  return v_pairs;
end;
$$;

revoke all on function public.reconcile_goal_xp_service(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_goal_xp_service(uuid)
  to service_role;
