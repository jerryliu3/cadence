alter table public.goals
add column if not exists milestone_names text[] null;
