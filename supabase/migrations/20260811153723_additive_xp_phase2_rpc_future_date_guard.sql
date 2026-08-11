-- XP Phase 2 follow-up:
-- Enforce future-date completion guards inside completion RPCs and make
-- completions table writes RPC-only for authenticated clients.

create or replace function private.raise_if_future_completion_date(
  p_user_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_today date;
begin
  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = p_user_id;

  v_local_today := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  if p_date > v_local_today then
    raise exception
      using errcode = '23514',
            message = 'future_completion_not_allowed';
  end if;
end;
$$;

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
      case when v_current = p_goal_id then 'manual'::public.completion_source else 'linked_cascade'::public.completion_source end
    )
    on conflict (goal_id, user_id, completed_on) do nothing;

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

drop policy if exists "completions_insert_by_actor"
on public.completions;

drop policy if exists "completions_delete_by_actor"
on public.completions;
