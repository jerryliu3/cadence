-- Drop is_group / goal_participants. Team-owned goals use goals.team_id.
-- Goal surfaces share one visibility predicate (owner | share | team_id |
-- active-pair personal). Profile relatedness stays off the pair branch.

drop function if exists public.create_group_goal(
  uuid, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, date, date
);
drop function if exists public.add_goal_participant(
  uuid, uuid, public.participant_role
);
drop function if exists public.remove_goal_participant(uuid, uuid);
drop function if exists public.create_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, boolean
);
drop function if exists public.create_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, uuid
);
drop function if exists public.update_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, boolean
);
drop function if exists public.update_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, uuid
);

create or replace function private.insert_goal_link_validated(
  p_owner_id uuid,
  p_source_goal_id uuid,
  p_target_goal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_owner uuid;
  v_target_owner uuid;
  v_source_team uuid;
  v_target_team uuid;
begin
  if p_source_goal_id = p_target_goal_id then
    raise exception using
      errcode = '23514',
      message = 'goal link source and target must differ';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(p_owner_id)
  );

  perform id
  from public.goals
  where id in (p_source_goal_id, p_target_goal_id)
  order by id
  for key share;

  select owner_id, team_id
  into v_source_owner, v_source_team
  from public.goals
  where id = p_source_goal_id;

  select owner_id, team_id
  into v_target_owner, v_target_team
  from public.goals
  where id = p_target_goal_id;

  if v_source_owner is null or v_target_owner is null then
    raise exception using
      errcode = '23503',
      message = 'both goals must exist for linking';
  end if;

  if v_source_owner <> p_owner_id or v_target_owner <> p_owner_id then
    raise exception using
      errcode = '23514',
      message = 'goal links may only connect goals owned by the link owner';
  end if;

  if v_source_team is not null or v_target_team is not null then
    raise exception using
      errcode = '23514',
      message = 'team goals cannot participate in personal goal links';
  end if;

  insert into public.goal_links (
    owner_id,
    source_goal_id,
    target_goal_id
  )
  values (
    p_owner_id,
    p_source_goal_id,
    p_target_goal_id
  );
end;
$$;

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

  if p_team_id is not null and not exists (
    select 1
    from public.team_members member
    where member.team_id = p_team_id
      and member.user_id = v_uid
  ) then
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

  if p_team_id is not null and not exists (
    select 1
    from public.team_members member
    where member.team_id = p_team_id
      and member.user_id = v_uid
  ) then
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

create or replace function public.create_goals(
  p_goals jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_id uuid;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if p_goals is null or jsonb_typeof(p_goals) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_goals must be a json array';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_goals)
  loop
    v_id := public.create_goal(
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      v_item->>'title',
      nullif(v_item->>'description', ''),
      nullif(v_item->>'reward_text', ''),
      coalesce(v_item->>'category', 'general'),
      nullif(v_item->>'category_key', ''),
      nullif(v_item->>'color', ''),
      coalesce(
        (v_item->>'frequency_type')::public.goal_frequency_type,
        'recurring'::public.goal_frequency_type
      ),
      nullif(v_item->>'recurrence_interval', '')::public.recurrence_interval,
      nullif(v_item->>'target_count', '')::integer,
      case
        when v_item ? 'milestone_names'
          and jsonb_typeof(v_item->'milestone_names') = 'array'
        then array(
          select jsonb_array_elements_text(v_item->'milestone_names')
        )
        else null
      end,
      coalesce((v_item->>'start_date')::date, current_date),
      nullif(v_item->>'end_date', '')::date,
      nullif(v_item->>'default_local_time', ''),
      nullif(v_item->>'team_id', '')::uuid,
      coalesce((v_item->>'is_private')::boolean, false)
    );
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$$;

drop policy if exists profiles_select_self_or_related on public.profiles;
create policy profiles_select_self_or_related
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.goals goal
    where goal.owner_id = profiles.id
      and goal.is_deleted = false
      and (
        exists (
          select 1
          from public.goal_shares share
          where share.goal_id = goal.id
            and share.shared_with = (select auth.uid())
        )
        or (
          goal.team_id is not null
          and exists (
            select 1
            from public.team_members member
            where member.team_id = goal.team_id
              and member.user_id = (select auth.uid())
          )
        )
      )
  )
  or exists (
    select 1
    from public.goals goal
    where goal.team_id is not null
      and goal.is_deleted = false
      and goal.owner_id = (select auth.uid())
      and public.can_view_goal(goal.id, profiles.id)
  )
);

create or replace function public.can_view_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals goal
    left join public.goal_shares share
      on share.goal_id = goal.id
      and share.shared_with = p_uid
    where goal.id = p_goal_id
      and goal.is_deleted = false
      and (
        goal.owner_id = p_uid
        or share.shared_with is not null
        or (
          goal.team_id is not null
          and exists (
            select 1
            from public.team_members member
            where member.team_id = goal.team_id
              and member.user_id = p_uid
          )
        )
        or (
          goal.team_id is null
          and goal.is_private = false
          and private.is_active_team_pair(goal.owner_id, p_uid)
        )
      )
  );
$$;

create or replace function public.get_team_goal_progress(p_goal_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  completion_count integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if not public.can_view_goal(p_goal_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not authorized for goal';
  end if;

  select goal.team_id
  into v_team_id
  from public.goals goal
  where goal.id = p_goal_id
    and goal.is_deleted = false;

  if v_team_id is null then
    raise exception using
      errcode = '22023',
      message = 'team_goal_required';
  end if;

  return query
  select
    member.user_id,
    profile.username,
    profile.display_name,
    count(completion.id)::integer as completion_count
  from public.team_members member
  join public.profiles profile on profile.id = member.user_id
  left join public.completions completion
    on completion.goal_id = p_goal_id
    and completion.user_id = member.user_id
  where member.team_id = v_team_id
  group by member.user_id, profile.username, profile.display_name
  order by member.user_id;
end;
$$;

drop policy if exists goals_select_related_users on public.goals;
create policy goals_select_related_users
on public.goals
for select
to authenticated
using (public.can_view_goal(id, (select auth.uid())));

drop policy if exists completions_select_viewable_goal on public.completions;
create policy completions_select_viewable_goal
on public.completions
for select
to authenticated
using (public.can_view_goal(goal_id, (select auth.uid())));

drop function if exists public.can_view_goal_content(uuid, uuid);

drop table if exists public.goal_participants cascade;
alter table public.goals drop column if exists is_group;
drop type if exists public.participant_role;

drop policy if exists team_members_select_own on public.team_members;
create policy team_members_select_own
on public.team_members
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on table public.team_members to authenticated;

revoke all on function public.create_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, uuid, boolean
) from public, anon;
grant execute on function public.create_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, uuid, boolean
) to authenticated;

revoke all on function public.update_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, uuid, boolean
) from public, anon;
grant execute on function public.update_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, uuid, boolean
) to authenticated;
