-- Additive Phase 49:
-- - Rewrite completion cascades to recursive CTE traversal.
-- - Harden remaining public SECURITY DEFINER helpers to search_path = ''.

create or replace function public.can_administer_goal(
  p_goal_id uuid,
  p_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals g
    where g.id = p_goal_id
      and g.owner_id = p_uid
  );
$$;

create or replace function public.can_complete_goal(
  p_goal_id uuid,
  p_uid uuid
)
returns boolean
language sql
stable
security definer
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

create or replace function public.can_view_goal(
  p_goal_id uuid,
  p_uid uuid
)
returns boolean
language sql
stable
security definer
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
      and (
        g.owner_id = p_uid
        or gp.user_id is not null
        or gs.shared_with is not null
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
  resolved_username text;
begin
  base_username := pg_catalog.lower(
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(pg_catalog.split_part(new.email, '@', 1), ''),
      'user'
    )
  );

  base_username := pg_catalog.regexp_replace(
    base_username,
    '[^a-z0-9_]',
    '',
    'g'
  );
  if base_username = '' then
    base_username := 'user';
  end if;

  resolved_username := base_username;
  if exists (
    select 1
    from public.profiles
    where username = resolved_username
  ) then
    raise exception 'Username is already taken.'
      using errcode = '23505';
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url
  )
  values (
    new.id,
    resolved_username,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      resolved_username
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;

  return new;
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
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.can_complete_goal(p_goal_id, v_uid) then
    raise exception 'not authorized for goal %', p_goal_id;
  end if;

  with recursive reachable as (
    select
      p_goal_id as goal_id,
      0 as depth,
      array[p_goal_id]::uuid[] as path
    union all
    select
      gl.target_goal_id as goal_id,
      reachable.depth + 1 as depth,
      reachable.path || gl.target_goal_id as path
    from reachable
    join public.goal_links gl
      on gl.source_goal_id = reachable.goal_id
     and gl.owner_id = v_uid
    join public.goals source_goal
      on source_goal.id = gl.source_goal_id
     and source_goal.owner_id = v_uid
    join public.goals target_goal
      on target_goal.id = gl.target_goal_id
     and target_goal.owner_id = v_uid
    where not gl.target_goal_id = any(reachable.path)
  ),
  reachable_once as (
    select
      goal_id,
      min(depth) as depth
    from reachable
    group by goal_id
  )
  insert into public.completions (
    goal_id,
    user_id,
    completed_on,
    source
  )
  select
    reachable_once.goal_id,
    v_uid,
    p_date,
    case
      when reachable_once.depth = 0
        then 'manual'::public.completion_source
      else 'linked_cascade'::public.completion_source
    end
  from reachable_once
  on conflict (goal_id, user_id, completed_on) do nothing;
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
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if not public.can_complete_goal(p_goal_id, v_uid) then
    raise exception 'not authorized for goal %', p_goal_id;
  end if;

  with recursive reachable as (
    select
      p_goal_id as goal_id,
      array[p_goal_id]::uuid[] as path
    union all
    select
      gl.target_goal_id as goal_id,
      reachable.path || gl.target_goal_id as path
    from reachable
    join public.goal_links gl
      on gl.source_goal_id = reachable.goal_id
     and gl.owner_id = v_uid
    join public.goals source_goal
      on source_goal.id = gl.source_goal_id
     and source_goal.owner_id = v_uid
    join public.goals target_goal
      on target_goal.id = gl.target_goal_id
     and target_goal.owner_id = v_uid
    where not gl.target_goal_id = any(reachable.path)
  ),
  reachable_once as (
    select distinct goal_id
    from reachable
  )
  delete from public.completions completion
  using reachable_once
  where completion.goal_id = reachable_once.goal_id
    and completion.user_id = v_uid
    and completion.completed_on = p_date;
end;
$$;
