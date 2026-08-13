-- Social Duo 1:
-- An active team pair is total mutual visibility on personal goals.
--
-- Rebased onto the team_members model. The predicate this originally targeted,
-- public.can_view_goal_content, was dropped in 20260813190553_drop_group_goals
-- and its callers now use public.can_view_goal, so the change lands there.
--
-- Only the team-pair branch changes. goal_shares keeps its is_private gate
-- (sharing a single goal is not the same consent as pairing), and the
-- team_id branch was already unconditional for members.
--
-- goals.is_private retains its remaining job: masking goal_title in
-- public.get_social_feed.

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
        or (
          share.shared_with is not null
          and goal.is_private = false
        )
        or (
          goal.team_id is not null
          and private.is_active_team_member(goal.team_id, p_uid)
        )
        or (
          goal.team_id is null
          and private.is_active_team_pair(goal.owner_id, p_uid)
        )
      )
  );
$$;

comment on column public.goals.is_private is
  'Masks goal_title in public.get_social_feed and gates goal_shares visibility. '
  'Does not gate an active team pair, which sees all of a partner''s goals.';
