-- Additive phase 53:
-- Harden legacy goal RPCs by pinning an empty search_path and keeping all
-- table/function references schema-qualified.

create or replace function public.can_view_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals g
    left join public.goal_participants gp
      on gp.goal_id = g.id and gp.user_id = p_uid
    left join public.goal_shares gs
      on gs.goal_id = g.id and gs.shared_with = p_uid
    where g.id = p_goal_id
      and g.is_deleted = false
      and (g.owner_id = p_uid or gp.user_id is not null or gs.shared_with is not null)
  );
$$;

create or replace function public.can_complete_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals g
    left join public.goal_participants gp
      on gp.goal_id = g.id and gp.user_id = p_uid
    where g.id = p_goal_id
      and g.is_deleted = false
      and (g.owner_id = p_uid or gp.user_id is not null)
  );
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

create or replace function public.can_administer_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals g
    where g.id = p_goal_id
      and g.owner_id = p_uid
  );
$$;

revoke execute on function public.can_view_goal(uuid, uuid) from public;
revoke execute on function public.can_view_goal(uuid, uuid) from anon;
revoke execute on function public.can_complete_goal(uuid, uuid) from public;
revoke execute on function public.can_complete_goal(uuid, uuid) from anon;
revoke execute on function public.mark_goal_complete(uuid, date) from public;
revoke execute on function public.mark_goal_complete(uuid, date) from anon;
revoke execute on function public.unmark_goal_complete(uuid, date) from public;
revoke execute on function public.unmark_goal_complete(uuid, date) from anon;
revoke execute on function public.can_administer_goal(uuid, uuid) from public;
revoke execute on function public.can_administer_goal(uuid, uuid) from anon;

grant execute on function public.can_view_goal(uuid, uuid) to authenticated;
grant execute on function public.can_complete_goal(uuid, uuid) to authenticated;
grant execute on function public.mark_goal_complete(uuid, date) to authenticated;
grant execute on function public.unmark_goal_complete(uuid, date) to authenticated;
grant execute on function public.can_administer_goal(uuid, uuid) to authenticated;
