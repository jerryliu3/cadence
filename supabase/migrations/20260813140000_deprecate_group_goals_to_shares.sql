-- Deprecate collaborative group goals in favor of team sharing.
-- Convert remaining group-goal membership into read-only shares, then clear is_group.

insert into public.goal_shares (goal_id, shared_with)
select participant.goal_id, participant.user_id
from public.goal_participants participant
join public.goals goal
  on goal.id = participant.goal_id
where goal.is_group
  and participant.user_id <> goal.owner_id
on conflict (goal_id, shared_with) do nothing;

delete from public.goal_participants participant
using public.goals goal
where participant.goal_id = goal.id
  and goal.is_group;

update public.goals
set is_group = false
where is_group;
