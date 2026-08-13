-- Deprecate collaborative group goals in favor of team sharing.
-- Convert remaining membership into read-only shares, including goals that
-- were created as group goals and later toggled off (is_group = false while
-- participant rows remain). Then clear is_group.

insert into public.goal_shares (goal_id, shared_with)
select participant.goal_id, participant.user_id
from public.goal_participants participant
join public.goals goal
  on goal.id = participant.goal_id
where participant.user_id <> goal.owner_id
on conflict (goal_id, shared_with) do nothing;

delete from public.goal_participants
where role = 'participant'::public.participant_role;

update public.goals
set is_group = false
where is_group;
