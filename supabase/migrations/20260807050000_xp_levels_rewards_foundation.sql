alter table public.goals
add column if not exists reward_text text;

do $$
begin
  alter table public.goals
  add constraint goals_reward_text_length
  check (
    reward_text is null
    or pg_catalog.length(reward_text) <= 500
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.xp_levels (
  level integer primary key
    check (level >= 1),
  min_total_xp integer not null unique
    check (min_total_xp >= 0),
  title text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint xp_levels_title_length
    check (pg_catalog.length(title) between 1 and 100)
);

insert into public.xp_levels (level, min_total_xp, title)
values
  (1, 0, 'Level 1'),
  (2, 100, 'Level 2'),
  (3, 250, 'Level 3'),
  (4, 450, 'Level 4'),
  (5, 700, 'Level 5'),
  (6, 1000, 'Level 6'),
  (7, 1400, 'Level 7'),
  (8, 1900, 'Level 8'),
  (9, 2500, 'Level 9'),
  (10, 3200, 'Level 10')
on conflict (level) do update
set
  min_total_xp = excluded.min_total_xp,
  title = excluded.title;

create table if not exists public.xp_rewards (
  id uuid primary key default gen_random_uuid(),
  level integer not null
    references public.xp_levels(level)
    on delete cascade,
  reward_code text not null unique,
  reward_title text not null,
  reward_description text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint xp_rewards_level_unique unique (level),
  constraint xp_rewards_code_format
    check (reward_code ~ '^[a-z0-9._-]{1,100}$'),
  constraint xp_rewards_title_length
    check (pg_catalog.length(reward_title) between 1 and 200),
  constraint xp_rewards_description_length
    check (pg_catalog.length(reward_description) between 1 and 500)
);

insert into public.xp_rewards (
  level,
  reward_code,
  reward_title,
  reward_description
)
values
  (2, 'reward.streak_starter', 'Streak Starter', 'You unlocked your first level-up reward.'),
  (4, 'reward.consistency_core', 'Consistency Core', 'You are building consistent momentum.'),
  (6, 'reward.focus_engine', 'Focus Engine', 'You have reached a strong execution rhythm.'),
  (8, 'reward.long_game', 'Long Game', 'You are sustaining effort over long horizons.'),
  (10, 'reward.goalmaxxer', 'Goalmaxxer', 'Top-level cadence unlocked.')
on conflict (reward_code) do update
set
  level = excluded.level,
  reward_title = excluded.reward_title,
  reward_description = excluded.reward_description;

create table if not exists public.xp_profiles (
  user_id uuid primary key
    references public.profiles(id)
    on delete cascade,
  total_xp integer not null default 0
    check (total_xp >= 0),
  current_level integer not null
    references public.xp_levels(level),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists xp_profiles_level_idx
on public.xp_profiles (current_level desc, total_xp desc);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  goal_id uuid not null,
  completion_id uuid not null,
  completed_on date not null,
  completion_source public.completion_source not null,
  event_type text not null
    check (event_type in ('award', 'reversal')),
  xp_delta integer not null
    check (xp_delta <> 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint xp_ledger_user_completion_event_unique
    unique (user_id, completion_id, event_type),
  constraint xp_ledger_metadata_shape
    check (
      pg_catalog.jsonb_typeof(metadata) = 'object'
      and pg_catalog.octet_length(metadata::text) <= 16384
    )
);

create index if not exists xp_ledger_user_created_idx
on public.xp_ledger (user_id, created_at desc);

create index if not exists xp_ledger_user_goal_idx
on public.xp_ledger (user_id, goal_id, completed_on desc);

create or replace function private.manual_completion_xp()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20::integer;
$$;

create or replace function private.cascade_completion_xp_multiplier()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 0.25::numeric;
$$;

create or replace function private.xp_for_completion_source(
  p_source public.completion_source
)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  with config as (
    select
      private.manual_completion_xp() as manual_xp,
      private.cascade_completion_xp_multiplier() as cascade_multiplier
  )
  select case
    when p_source = 'linked_cascade' then greatest(
      1,
      pg_catalog.floor(config.manual_xp * config.cascade_multiplier)::integer
    )
    else config.manual_xp
  end
  from config;
$$;

create or replace function private.level_for_total_xp(
  p_total_xp integer
)
returns integer
language sql
stable
strict
set search_path = ''
as $$
  select coalesce(
    (
      select lvl.level
      from public.xp_levels lvl
      where lvl.min_total_xp <= greatest(p_total_xp, 0)
      order by lvl.min_total_xp desc
      limit 1
    ),
    1
  );
$$;

create or replace function private.ensure_xp_profile(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.xp_profiles (
    user_id,
    total_xp,
    current_level
  )
  values (
    p_user_id,
    0,
    private.level_for_total_xp(0)
  )
  on conflict (user_id) do nothing;
end;
$$;

create or replace function private.apply_xp_delta(
  p_user_id uuid,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_total integer;
begin
  if p_user_id is null or p_delta = 0 then
    return;
  end if;

  perform private.ensure_xp_profile(p_user_id);

  update public.xp_profiles profile
  set
    total_xp = greatest(profile.total_xp + p_delta, 0),
    current_level = private.level_for_total_xp(
      greatest(profile.total_xp + p_delta, 0)
    ),
    updated_at = pg_catalog.now()
  where profile.user_id = p_user_id
  returning profile.total_xp into v_next_total;

  if v_next_total is null then
    raise exception using
      errcode = 'P0001',
      message = 'xp profile mutation failed';
  end if;
end;
$$;

create or replace function private.capture_completion_xp_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_goal_id uuid;
  v_completion_id uuid;
  v_completed_on date;
  v_source public.completion_source;
  v_event_type text;
  v_xp_value integer;
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_user_id := new.user_id;
    v_goal_id := new.goal_id;
    v_completion_id := new.id;
    v_completed_on := new.completed_on;
    v_source := new.source;
    v_event_type := 'award';
  elsif tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_goal_id := old.goal_id;
    v_completion_id := old.id;
    v_completed_on := old.completed_on;
    v_source := old.source;
    v_event_type := 'reversal';
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_xp_value := private.xp_for_completion_source(v_source);
  v_delta := case
    when v_event_type = 'award' then v_xp_value
    else -v_xp_value
  end;

  insert into public.xp_ledger (
    user_id,
    goal_id,
    completion_id,
    completed_on,
    completion_source,
    event_type,
    xp_delta,
    metadata
  )
  values (
    v_user_id,
    v_goal_id,
    v_completion_id,
    v_completed_on,
    v_source,
    v_event_type,
    v_delta,
    pg_catalog.jsonb_build_object(
      'manualCompletionXp',
      private.manual_completion_xp(),
      'cascadeXpMultiplier',
      private.cascade_completion_xp_multiplier()
    )
  )
  on conflict (user_id, completion_id, event_type) do nothing;

  if found then
    perform private.apply_xp_delta(v_user_id, v_delta);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.initialize_xp_profile_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_xp_profile(new.id);
  return new;
end;
$$;

drop trigger if exists initialize_xp_profile on public.profiles;
create trigger initialize_xp_profile
after insert on public.profiles
for each row execute function private.initialize_xp_profile_for_profile();

insert into public.xp_profiles (user_id, total_xp, current_level)
select
  profile.id,
  0,
  private.level_for_total_xp(0)
from public.profiles profile
on conflict (user_id) do nothing;

insert into public.xp_ledger (
  user_id,
  goal_id,
  completion_id,
  completed_on,
  completion_source,
  event_type,
  xp_delta,
  metadata
)
select
  completion.user_id,
  completion.goal_id,
  completion.id,
  completion.completed_on,
  completion.source,
  'award',
  private.xp_for_completion_source(completion.source),
  pg_catalog.jsonb_build_object(
    'manualCompletionXp',
    private.manual_completion_xp(),
    'cascadeXpMultiplier',
    private.cascade_completion_xp_multiplier()
  )
from public.completions completion
on conflict (user_id, completion_id, event_type) do nothing;

with xp_totals as (
  select
    ledger.user_id,
    greatest(coalesce(sum(ledger.xp_delta), 0), 0)::integer as total_xp
  from public.xp_ledger ledger
  group by ledger.user_id
)
update public.xp_profiles profile
set
  total_xp = xp_totals.total_xp,
  current_level = private.level_for_total_xp(xp_totals.total_xp),
  updated_at = pg_catalog.now()
from xp_totals
where profile.user_id = xp_totals.user_id;

drop trigger if exists completions_xp_ledger on public.completions;
create trigger completions_xp_ledger
after insert or delete on public.completions
for each row execute function private.capture_completion_xp_event();

alter table public.xp_levels enable row level security;
alter table public.xp_rewards enable row level security;
alter table public.xp_profiles enable row level security;
alter table public.xp_ledger enable row level security;

drop policy if exists xp_levels_read on public.xp_levels;
create policy xp_levels_read
on public.xp_levels
for select
to authenticated
using (true);

drop policy if exists xp_rewards_read on public.xp_rewards;
create policy xp_rewards_read
on public.xp_rewards
for select
to authenticated
using (true);

drop policy if exists xp_profiles_owner_select on public.xp_profiles;
create policy xp_profiles_owner_select
on public.xp_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.xp_levels from public, anon, authenticated;
revoke all on table public.xp_rewards from public, anon, authenticated;
revoke all on table public.xp_profiles from public, anon, authenticated;
revoke all on table public.xp_ledger from public, anon, authenticated;

grant select on table public.xp_levels to authenticated;
grant select on table public.xp_rewards to authenticated;
grant select on table public.xp_profiles to authenticated;

revoke all on table public.xp_levels from service_role;
revoke all on table public.xp_rewards from service_role;
revoke all on table public.xp_profiles from service_role;
revoke all on table public.xp_ledger from service_role;

grant select on table public.xp_levels to service_role;
grant select on table public.xp_rewards to service_role;
grant select on table public.xp_profiles to service_role;
grant select on table public.xp_ledger to service_role;

revoke execute on function private.manual_completion_xp()
from public, anon, authenticated;
revoke execute on function private.cascade_completion_xp_multiplier()
from public, anon, authenticated;
revoke execute on function private.xp_for_completion_source(
  public.completion_source
)
from public, anon, authenticated;
revoke execute on function private.level_for_total_xp(integer)
from public, anon, authenticated;
revoke execute on function private.ensure_xp_profile(uuid)
from public, anon, authenticated;
revoke execute on function private.apply_xp_delta(uuid, integer)
from public, anon, authenticated;
revoke execute on function private.capture_completion_xp_event()
from public, anon, authenticated;
revoke execute on function private.initialize_xp_profile_for_profile()
from public, anon, authenticated;

grant execute on function private.level_for_total_xp(integer)
to service_role;
