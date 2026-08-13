-- Team-owned goals: goals.team_id is the membership surface.
-- Duo partners still view the owner's non-private personal goals
-- (team_id is null) via is_active_team_pair. They do not complete them.

alter table public.goals
  add column if not exists team_id uuid references public.teams(id) on delete set null;

comment on column public.goals.team_id is
  'When set, members of this team can view and complete the goal. Personal duo visibility stays on team_id-null non-private goals.';

alter table public.goals
  drop constraint if exists goals_team_id_not_private;

alter table public.goals
  add constraint goals_team_id_not_private
  check (team_id is null or is_private = false);

create index if not exists goals_team_id_idx
  on public.goals (team_id)
  where team_id is not null;

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
    left join public.goal_shares gs
      on gs.goal_id = g.id and gs.shared_with = p_uid
    where g.id = p_goal_id
      and g.is_deleted = false
      and (
        g.owner_id = p_uid
        or gs.shared_with is not null
        or (
          g.team_id is not null
          and exists (
            select 1
            from public.team_members member
            where member.team_id = g.team_id
              and member.user_id = p_uid
          )
        )
      )
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
    where g.id = p_goal_id
      and g.is_deleted = false
      and (
        g.owner_id = p_uid
        or (
          g.team_id is not null
          and exists (
            select 1
            from public.team_members member
            where member.team_id = g.team_id
              and member.user_id = p_uid
          )
        )
      )
  );
$$;

create or replace function public.can_view_goal_content(
  p_goal_id uuid,
  p_uid uuid
)
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

  if not public.can_view_goal_content(p_goal_id, v_uid) then
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
      and public.can_view_goal(goal.id, (select auth.uid()))
  )
  or exists (
    select 1
    from public.goal_participants participant
    where participant.user_id = profiles.id
      and exists (
        select 1
        from public.goals goal
        where goal.id = participant.goal_id
          and goal.owner_id = (select auth.uid())
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

revoke all on function public.get_team_goal_progress(uuid)
  from public, anon;
grant execute on function public.get_team_goal_progress(uuid)
  to authenticated;
