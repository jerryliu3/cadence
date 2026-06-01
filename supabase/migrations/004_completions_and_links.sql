create table public.completions (
  id uuid primary key default uuid_generate_v4(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_on date not null default current_date,
  source public.completion_source not null default 'manual',
  created_at timestamptz not null default now(),
  unique (goal_id, user_id, completed_on)
);

create index completions_goal_idx on public.completions(goal_id);
create index completions_user_idx on public.completions(user_id);
create index completions_date_idx on public.completions(completed_on);

create table public.goal_links (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_goal_id uuid not null references public.goals(id) on delete cascade,
  target_goal_id uuid not null references public.goals(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_goal_id, target_goal_id),
  check (source_goal_id <> target_goal_id)
);

create index goal_links_owner_idx on public.goal_links(owner_id);
create index goal_links_source_idx on public.goal_links(source_goal_id);
create index goal_links_target_idx on public.goal_links(target_goal_id);

create or replace function public.validate_goal_link()
returns trigger
language plpgsql
as $$
declare
  source_owner uuid;
  source_is_group boolean;
  target_owner uuid;
  target_is_group boolean;
begin
  select owner_id, is_group into source_owner, source_is_group
  from public.goals
  where id = new.source_goal_id;

  select owner_id, is_group into target_owner, target_is_group
  from public.goals
  where id = new.target_goal_id;

  if source_owner is null or target_owner is null then
    raise exception 'Both goals must exist for linking.';
  end if;

  if source_owner <> new.owner_id or target_owner <> new.owner_id then
    raise exception 'Goal links can only connect the owner''s own goals.';
  end if;

  if source_is_group or target_is_group then
    raise exception 'Group goals cannot participate in personal goal links.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_goal_link on public.goal_links;

create trigger validate_goal_link
before insert or update on public.goal_links
for each row execute function public.validate_goal_link();
