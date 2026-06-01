create table public.goal_participants (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.participant_role not null default 'participant',
  joined_at timestamptz not null default now(),
  unique (goal_id, user_id)
);

create index goal_participants_goal_idx on public.goal_participants(goal_id);
create index goal_participants_user_idx on public.goal_participants(user_id);

create table public.goal_shares (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (goal_id, shared_with)
);

create index goal_shares_goal_idx on public.goal_shares(goal_id);
create index goal_shares_shared_with_idx on public.goal_shares(shared_with);

create or replace function public.validate_goal_participant()
returns trigger
language plpgsql
as $$
declare
  goal_owner uuid;
  goal_is_group boolean;
begin
  select owner_id, is_group into goal_owner, goal_is_group
  from public.goals
  where id = new.goal_id;

  if goal_owner is null then
    raise exception 'Goal does not exist for participant row.';
  end if;

  if new.role = 'owner' and new.user_id <> goal_owner then
    raise exception 'Owner role must match the goal owner.';
  end if;

  if new.role = 'participant' and not goal_is_group then
    raise exception 'Only group goals may have participant members.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_goal_participant on public.goal_participants;

create trigger validate_goal_participant
before insert or update on public.goal_participants
for each row execute function public.validate_goal_participant();
