alter table public.goals
  drop constraint if exists goals_deadline_required_by_requirement;
