-- Add immediate-write targeted planner instance adjustments (add/delete)
-- with stale-digest protection and owner-scoped transactional updates.

create or replace function public.adjust_targeted_planner_instance(
  p_goal_id uuid,
  p_action text,
  p_scheduled_date date,
  p_unit_key text,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  goal_id uuid,
  unit_key text,
  target_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_action text := lower(coalesce(btrim(p_action), ''));
  v_current_digest text;
  v_goal public.goals%rowtype;
  v_kind text;
  v_effective_target_count integer;
  v_next_target_count integer;
  v_target_unit_key text;
  v_target_ordinal integer;
  v_target_item public.planner_items%rowtype;
  v_shift record;
  v_milestone_names text[];
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_goal_id is null then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;
  if v_action not in ('add', 'delete') then
    raise exception using errcode = '22023', message = 'invalid_adjust_action';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;

  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;

  select *
  into v_goal
  from public.goals goal
  where goal.id = p_goal_id
    and goal.owner_id = v_owner
    and goal.is_deleted = false
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'unknown_goal';
  end if;

  if v_goal.archived_at is not null
    or (v_goal.end_date is not null and current_date > v_goal.end_date) then
    raise exception using errcode = 'P0001', message = 'goal_terminal';
  end if;

  if v_goal.frequency_type = 'fixed_milestones' then
    v_kind := 'milestone_sequence';
    v_effective_target_count := greatest(coalesce(v_goal.target_count, 1), 1);
  elsif v_goal.frequency_type = 'recurring'
    and coalesce(v_goal.target_count, 0) > 0 then
    v_kind := 'deadline_total';
    v_effective_target_count := v_goal.target_count;
  else
    raise exception using errcode = 'P0001', message = 'unsupported_requirement_kind';
  end if;

  if v_action = 'add' then
    if p_scheduled_date is null then
      raise exception using errcode = '22023', message = 'invalid_adjust_date';
    end if;
    if p_scheduled_date < v_goal.start_date
      or (v_goal.end_date is not null and p_scheduled_date > v_goal.end_date) then
      raise exception using errcode = 'P0001', message = 'scheduled_outside_goal_lifetime';
    end if;
    if exists (
      select 1
      from public.planner_items item
      where item.owner_id = v_owner
        and item.goal_id = p_goal_id
        and item.scheduled_date = p_scheduled_date
    ) then
      raise exception using errcode = '22023', message = 'duplicate_goal_date';
    end if;

    v_next_target_count := v_effective_target_count + 1;
    v_target_unit_key :=
      format(
        '%s%s',
        case when v_kind = 'milestone_sequence' then 'milestone:' else 'total:' end,
        v_next_target_count
      );

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
        v_target_unit_key,
        p_scheduled_date,
        p_scheduled_date,
        null,
        false
      );
    exception
      when unique_violation then
        raise exception using errcode = 'P0001', message = 'schedule_conflict';
    end;

    if v_kind = 'milestone_sequence' then
      v_milestone_names := coalesce(
        (
          select array_agg(
            coalesce(v_goal.milestone_names[idx], format('Milestone %s', idx))
            order by idx
          )
          from generate_series(1, v_effective_target_count) as idx
        ),
        '{}'::text[]
      );
      v_milestone_names := v_milestone_names || format('Milestone %s', v_next_target_count);

      update public.goals goal
      set
        target_count = v_next_target_count,
        milestone_names = v_milestone_names
      where goal.id = p_goal_id;
    else
      update public.goals goal
      set target_count = v_next_target_count
      where goal.id = p_goal_id;
    end if;
  else
    v_target_unit_key := btrim(coalesce(p_unit_key, ''));
    if char_length(v_target_unit_key) < 1 then
      raise exception using errcode = '22023', message = 'invalid_unit_key';
    end if;

    select *
    into v_target_item
    from public.planner_items item
    where item.owner_id = v_owner
      and item.goal_id = p_goal_id
      and item.unit_key = v_target_unit_key
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'planner_item_not_found';
    end if;
    if v_target_item.locked then
      raise exception using errcode = 'P0001', message = 'planner_item_locked';
    end if;
    if exists (
      select 1
      from public.completions completion
      where completion.user_id = v_owner
        and completion.goal_id = p_goal_id
        and completion.completed_on = v_target_item.scheduled_date
    ) then
      raise exception using errcode = 'P0001', message = 'planner_item_credited';
    end if;
    if v_effective_target_count <= 1 then
      raise exception using errcode = 'P0001', message = 'minimum_target_count';
    end if;

    if v_kind = 'milestone_sequence' then
      v_target_ordinal :=
        nullif(
          substring(v_target_unit_key from '^milestone:([1-9][0-9]*)$'),
          ''
        )::integer;
    else
      v_target_ordinal :=
        nullif(
          substring(v_target_unit_key from '^total:([1-9][0-9]*)$'),
          ''
        )::integer;
    end if;

    if v_target_ordinal is null or v_target_ordinal > v_effective_target_count then
      raise exception using errcode = '22023', message = 'invalid_unit_key';
    end if;

    delete from public.planner_items item
    where item.id = v_target_item.id;

    if v_kind = 'milestone_sequence' then
      for v_shift in
        select
          item.id,
          (substring(item.unit_key from '^milestone:([1-9][0-9]*)$'))::integer as ordinal
        from public.planner_items item
        where item.owner_id = v_owner
          and item.goal_id = p_goal_id
          and item.unit_key ~ '^milestone:([1-9][0-9]*)$'
          and (substring(item.unit_key from '^milestone:([1-9][0-9]*)$'))::integer > v_target_ordinal
        order by ordinal asc
      loop
        update public.planner_items item
        set unit_key = format('__shift__milestone:%s', v_shift.ordinal - 1)
        where item.id = v_shift.id;
      end loop;
    else
      for v_shift in
        select
          item.id,
          (substring(item.unit_key from '^total:([1-9][0-9]*)$'))::integer as ordinal
        from public.planner_items item
        where item.owner_id = v_owner
          and item.goal_id = p_goal_id
          and item.unit_key ~ '^total:([1-9][0-9]*)$'
          and (substring(item.unit_key from '^total:([1-9][0-9]*)$'))::integer > v_target_ordinal
        order by ordinal asc
      loop
        update public.planner_items item
        set unit_key = format('__shift__total:%s', v_shift.ordinal - 1)
        where item.id = v_shift.id;
      end loop;
    end if;

    update public.planner_items item
    set unit_key = substring(item.unit_key from '^__shift__(.*)$')
    where item.owner_id = v_owner
      and item.goal_id = p_goal_id
      and item.unit_key like '__shift__%';

    v_next_target_count := v_effective_target_count - 1;
    if v_kind = 'milestone_sequence' then
      v_milestone_names := coalesce(
        (
          select array_agg(
            coalesce(v_goal.milestone_names[idx], format('Milestone %s', idx))
            order by idx
          )
          from generate_series(1, v_next_target_count) as idx
        ),
        '{}'::text[]
      );

      update public.goals goal
      set
        target_count = v_next_target_count,
        milestone_names = v_milestone_names
      where goal.id = p_goal_id;
    else
      update public.goals goal
      set target_count = v_next_target_count
      where goal.id = p_goal_id;
    end if;
  end if;

  perform private.recompute_xp_for_goal_users(p_goal_id);

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    p_goal_id,
    v_target_unit_key,
    v_next_target_count;
end;
$$;

revoke all on function public.adjust_targeted_planner_instance(uuid, text, date, text, text) from public;
grant execute on function public.adjust_targeted_planner_instance(uuid, text, date, text, text) to authenticated;
