create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'general',
  color text,
  frequency_type public.goal_frequency_type not null,
  recurrence_interval public.recurrence_interval,
  target_count integer,
  start_date date not null default current_date,
  end_date date,
  photo_path text,
  is_group boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_needs_interval
    check (frequency_type <> 'recurring' or recurrence_interval is not null),
  constraint milestones_need_target
    check (frequency_type <> 'fixed_milestones' or (target_count is not null and target_count > 0)),
  constraint end_after_start
    check (end_date is null or end_date >= start_date)
);

create index goals_owner_idx on public.goals(owner_id);
create index goals_group_idx on public.goals(is_group);
create index goals_archived_idx on public.goals(archived_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_goals_updated_at on public.goals;

create trigger set_goals_updated_at
before update on public.goals
for each row execute function public.set_updated_at();
