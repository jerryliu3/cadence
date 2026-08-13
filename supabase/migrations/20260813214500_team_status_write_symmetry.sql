-- Write paths must use the same active-membership predicate as the read paths.
-- create_goal / update_goal previously accepted any team_members row, so a member
-- of a closed team could stamp its team_id onto a goal. can_view_goal requires an
-- ACTIVE membership, so the result was a goal only its owner could ever see.
--
-- Also make the member-cap trigger self-sufficient. It counted without a lock and
-- was correct only because create_team_invite_service happens to hold per-user
-- advisory locks. Any future insert path (a join-by-link flow once
-- private.max_team_size() is raised) would have silently broken the cap.

create or replace function public.create_goal(
  p_id uuid,
  p_title text,
  p_description text default null,
  p_reward_text text default null,
  p_category text default 'general',
  p_category_key text default null,
  p_color text default null,
  p_frequency_type public.goal_frequency_type default 'recurring',
  p_recurrence_interval public.recurrence_interval default null,
  p_target_count integer default null,
  p_milestone_names text[] default null,
  p_start_date date default current_date,
  p_end_date date default null,
  p_default_local_time text default null,
  p_team_id uuid default null,
  p_is_private boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_category text;
  v_category_key text;
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if p_team_id is not null
    and not private.is_active_team_member(p_team_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not a member of team';
  end if;

  select n.category, n.category_key
  into v_category, v_category_key
  from private.normalize_goal_category_pair(p_category, p_category_key) n;

  insert into public.goals (
    id,
    owner_id,
    title,
    description,
    reward_text,
    category,
    category_key,
    color,
    frequency_type,
    recurrence_interval,
    target_count,
    milestone_names,
    start_date,
    end_date,
    default_local_time,
    team_id,
    is_private,
    is_deleted
  )
  values (
    v_id,
    v_uid,
    p_title,
    p_description,
    p_reward_text,
    v_category,
    v_category_key,
    p_color,
    p_frequency_type,
    p_recurrence_interval,
    p_target_count,
    p_milestone_names,
    p_start_date,
    p_end_date,
    p_default_local_time,
    p_team_id,
    coalesce(p_is_private, false),
    false
  );

  return v_id;
end;
$$;

create or replace function public.update_goal(
  p_id uuid,
  p_title text,
  p_description text default null,
  p_reward_text text default null,
  p_category text default 'general',
  p_category_key text default null,
  p_color text default null,
  p_frequency_type public.goal_frequency_type default 'recurring',
  p_recurrence_interval public.recurrence_interval default null,
  p_target_count integer default null,
  p_milestone_names text[] default null,
  p_start_date date default current_date,
  p_end_date date default null,
  p_default_local_time text default null,
  p_team_id uuid default null,
  p_is_private boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.goals%rowtype;
  v_category text;
  v_category_key text;
  v_needs_xp boolean := false;
  v_is_private boolean := coalesce(p_is_private, false);
begin
  perform private.assert_goal_owner(p_id, v_uid);

  if p_team_id is not null
    and not private.is_active_team_member(p_team_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not a member of team';
  end if;

  select *
  into v_old
  from public.goals
  where id = p_id
  for update;

  select n.category, n.category_key
  into v_category, v_category_key
  from private.normalize_goal_category_pair(p_category, p_category_key) n;

  v_needs_xp :=
    v_old.target_count is distinct from p_target_count
    or v_old.start_date is distinct from p_start_date
    or v_old.end_date is distinct from p_end_date
    or v_old.frequency_type is distinct from p_frequency_type
    or v_old.recurrence_interval is distinct from p_recurrence_interval
    or v_old.category_key is distinct from v_category_key;

  update public.goals
  set
    title = p_title,
    description = p_description,
    reward_text = p_reward_text,
    category = v_category,
    category_key = v_category_key,
    color = p_color,
    frequency_type = p_frequency_type,
    recurrence_interval = p_recurrence_interval,
    target_count = p_target_count,
    milestone_names = p_milestone_names,
    start_date = p_start_date,
    end_date = p_end_date,
    default_local_time = p_default_local_time,
    team_id = p_team_id,
    is_private = v_is_private
  where id = p_id
    and owner_id = v_uid;

  if v_is_private then
    delete from public.goal_shares
    where goal_id = p_id;
  end if;

  if v_needs_xp then
    perform private.recompute_xp_for_goal_users(p_id);
  end if;
end;
$$;

create or replace function private.assert_team_member_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize concurrent inserts for this team so the count below cannot race.
  -- Callers already take per-user locks; user-then-team ordering is consistent
  -- across every path, so this cannot deadlock against them.
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team:' || new.team_id::text)
  );

  if (
    select count(*)
    from public.team_members member
    where member.team_id = new.team_id
  ) >= private.max_team_size() then
    raise exception using errcode = '23514', message = 'team_member_cap_exceeded';
  end if;
  return new;
end;
$$;
