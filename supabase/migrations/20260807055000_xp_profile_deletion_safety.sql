create or replace function private.ensure_xp_profile(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.xp_profiles (
    user_id,
    total_xp,
    current_level
  )
  select
    p_user_id,
    0,
    private.level_for_total_xp(0)
  where exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
  )
  on conflict (user_id) do nothing;
end;
$$;

create or replace function private.apply_xp_delta(
  p_user_id uuid,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_total integer;
begin
  if p_user_id is null or p_delta = 0 then
    return;
  end if;

  perform private.ensure_xp_profile(p_user_id);

  update public.xp_profiles profile
  set
    total_xp = greatest(profile.total_xp + p_delta, 0),
    current_level = private.level_for_total_xp(
      greatest(profile.total_xp + p_delta, 0)
    ),
    updated_at = pg_catalog.now()
  where profile.user_id = p_user_id
  returning profile.total_xp into v_next_total;

  if v_next_total is null then
    if exists (
      select 1
      from public.profiles profile
      where profile.id = p_user_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'xp profile mutation failed';
    end if;
    return;
  end if;
end;
$$;

create or replace function private.capture_completion_xp_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_goal_id uuid;
  v_completion_id uuid;
  v_completed_on date;
  v_source public.completion_source;
  v_event_type text;
  v_xp_value integer;
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_user_id := new.user_id;
    v_goal_id := new.goal_id;
    v_completion_id := new.id;
    v_completed_on := new.completed_on;
    v_source := new.source;
    v_event_type := 'award';
  elsif tg_op = 'DELETE' then
    if pg_catalog.current_setting(
      'app.planner_deleting_profile_id',
      true
    ) = old.user_id::text then
      return old;
    end if;
    v_user_id := old.user_id;
    v_goal_id := old.goal_id;
    v_completion_id := old.id;
    v_completed_on := old.completed_on;
    v_source := old.source;
    v_event_type := 'reversal';
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_xp_value := private.xp_for_completion_source(v_source);
  v_delta := case
    when v_event_type = 'award' then v_xp_value
    else -v_xp_value
  end;

  insert into public.xp_ledger (
    user_id,
    goal_id,
    completion_id,
    completed_on,
    completion_source,
    event_type,
    xp_delta,
    metadata
  )
  values (
    v_user_id,
    v_goal_id,
    v_completion_id,
    v_completed_on,
    v_source,
    v_event_type,
    v_delta,
    pg_catalog.jsonb_build_object(
      'manualCompletionXp',
      private.manual_completion_xp(),
      'cascadeXpMultiplier',
      private.cascade_completion_xp_multiplier()
    )
  )
  on conflict (user_id, completion_id, event_type) do nothing;

  if found then
    perform private.apply_xp_delta(v_user_id, v_delta);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
