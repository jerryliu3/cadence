-- XP Phase 4:
-- Align XP foundation with the consolidated contract:
-- multi-track profiles, event-typed ledger, reward lifecycle, consistency checks,
-- and full trigger fan-out across completion/goal/profile writes.

drop trigger if exists completions_sync_goal_xp
on public.completions;

drop function if exists private.sync_goal_xp_from_completion();
drop function if exists private.local_today_for_user(uuid);
drop function if exists private.xp_level_for_total(integer);
drop function if exists private.xp_lock_key(text);
drop function if exists public.refresh_xp_profile(uuid);
drop function if exists public.recompute_goal_xp_service(uuid, uuid);
drop function if exists public.award_social_xp_service(
  uuid,
  integer,
  text,
  text,
  text,
  date
);

drop table if exists public.xp_ledger cascade;
drop table if exists public.xp_profiles cascade;

create table if not exists public.xp_levels (
  level integer primary key check (level >= 1),
  min_total_xp integer not null unique check (min_total_xp >= 0),
  title text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint xp_levels_title_length
    check (pg_catalog.length(title) between 1 and 100)
);

create table if not exists public.xp_rewards (
  id uuid primary key default gen_random_uuid(),
  level integer not null references public.xp_levels(level) on delete cascade,
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

insert into public.xp_levels (level, min_total_xp, title)
values
  (1, 0, 'Starter'),
  (2, 100, 'Momentum'),
  (3, 250, 'Builder'),
  (4, 450, 'Steady'),
  (5, 700, 'Focused'),
  (6, 1000, 'Driven'),
  (7, 1400, 'Committed'),
  (8, 1900, 'Advanced'),
  (9, 2500, 'Elite'),
  (10, 3200, 'Legend')
on conflict (level) do update
set
  min_total_xp = excluded.min_total_xp,
  title = excluded.title;

insert into public.xp_rewards (
  level,
  reward_code,
  reward_title,
  reward_description
)
values
  (2, 'xp.level.2', 'Level 2 unlocked', 'You reached Level 2.'),
  (4, 'xp.level.4', 'Level 4 unlocked', 'You reached Level 4.'),
  (6, 'xp.level.6', 'Level 6 unlocked', 'You reached Level 6.'),
  (8, 'xp.level.8', 'Level 8 unlocked', 'You reached Level 8.'),
  (10, 'xp.level.10', 'Level 10 unlocked', 'You reached Level 10.')
on conflict (level) do update
set
  reward_code = excluded.reward_code,
  reward_title = excluded.reward_title,
  reward_description = excluded.reward_description;

create or replace function private.assert_xp_levels_monotonic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.xp_levels lo
    join public.xp_levels hi
      on lo.level < hi.level
     and lo.min_total_xp >= hi.min_total_xp
  ) then
    raise exception
      using errcode = '23514',
            message = 'xp_levels.min_total_xp must increase with level';
  end if;

  return null;
end;
$$;

drop trigger if exists xp_levels_assert_monotonic
on public.xp_levels;

create trigger xp_levels_assert_monotonic
after insert or update or delete
on public.xp_levels
for each statement
execute function private.assert_xp_levels_monotonic();

create table if not exists public.xp_profiles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_key text not null,
  total_xp integer not null default 0 check (total_xp >= 0),
  current_level integer not null references public.xp_levels(level),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, track_key),
  constraint xp_profiles_track_key_format
    check (track_key ~ '^[a-z][a-z0-9_]{1,31}$')
);

create index if not exists xp_profiles_leaderboard_idx
on public.xp_profiles (track_key, total_xp desc, user_id);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete cascade,
  completion_id uuid references public.completions(id) on delete set null,
  track_key text not null,
  event_type text not null,
  entry_kind text not null,
  source_key text not null,
  xp_delta integer not null,
  earned_on date not null,
  completion_source public.completion_source,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint xp_ledger_track_key_format
    check (track_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint xp_ledger_event_type_valid
    check (
      event_type in (
        'completion_credit',
        'goal_achievement',
        'challenge_award',
        'season_award'
      )
    ),
  constraint xp_ledger_entry_kind_valid
    check (entry_kind in ('award', 'reversal')),
  constraint xp_ledger_entry_kind_sign
    check (
      (entry_kind = 'award' and xp_delta > 0)
      or (entry_kind = 'reversal' and xp_delta < 0)
    ),
  constraint xp_ledger_goal_scoped_events
    check (
      goal_id is not null
      or event_type in ('challenge_award', 'season_award')
    ),
  constraint xp_ledger_source_key_length
    check (pg_catalog.length(source_key) between 1 and 100),
  constraint xp_ledger_metadata_shape
    check (
      pg_catalog.jsonb_typeof(metadata) = 'object'
      and pg_catalog.octet_length(metadata::text) <= 4096
    )
);

create unique index if not exists xp_ledger_seq_key
on public.xp_ledger (seq);

create index if not exists xp_ledger_balance_idx
on public.xp_ledger (user_id, goal_id, source_key, track_key);

create index if not exists xp_ledger_user_earned_idx
on public.xp_ledger (user_id, earned_on desc, seq desc);

create index if not exists xp_ledger_track_earned_idx
on public.xp_ledger (track_key, earned_on desc, seq desc);

create unique index if not exists xp_ledger_nongoal_award_key
on public.xp_ledger (user_id, event_type, source_key)
where goal_id is null;

alter table public.goals
add column if not exists reward_text text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_reward_text_length'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
    add constraint goals_reward_text_length
    check (
      reward_text is null
      or pg_catalog.length(reward_text) <= 500
    );
  end if;
end;
$$;

create table if not exists public.user_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.xp_rewards(id) on delete cascade,
  unlocked_at timestamptz not null default pg_catalog.now(),
  acknowledged_at timestamptz,
  revoked_at timestamptz,
  constraint user_awards_unique_reward unique (user_id, reward_id)
);

create index if not exists user_awards_pending_idx
on public.user_awards (user_id, unlocked_at desc)
where acknowledged_at is null;

alter table public.xp_levels enable row level security;
alter table public.xp_rewards enable row level security;
alter table public.xp_profiles enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.user_awards enable row level security;

drop policy if exists xp_levels_read_all
on public.xp_levels;
create policy xp_levels_read_all
on public.xp_levels
for select
to authenticated
using (true);

drop policy if exists xp_rewards_read_all
on public.xp_rewards;
create policy xp_rewards_read_all
on public.xp_rewards
for select
to authenticated
using (true);

drop policy if exists xp_profiles_select_self
on public.xp_profiles;
create policy xp_profiles_select_self
on public.xp_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists xp_ledger_select_self
on public.xp_ledger;
create policy xp_ledger_select_self
on public.xp_ledger
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_awards_select_self
on public.user_awards;
create policy user_awards_select_self
on public.user_awards
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.xp_levels from public, anon, authenticated;
revoke all on table public.xp_rewards from public, anon, authenticated;
revoke all on table public.xp_profiles from public, anon, authenticated;
revoke all on table public.xp_ledger from public, anon, authenticated;
revoke all on table public.user_awards from public, anon, authenticated;

grant select on table public.xp_levels to authenticated;
grant select on table public.xp_rewards to authenticated;
grant select on table public.xp_profiles to authenticated;
grant select on table public.xp_ledger to authenticated;
grant select on table public.user_awards to authenticated;

grant select, insert, update, delete on table public.xp_levels to service_role;
grant select, insert, update, delete on table public.xp_rewards to service_role;
grant select, insert, update, delete on table public.xp_profiles to service_role;
grant select, insert, update, delete on table public.xp_ledger to service_role;
grant select, insert, update, delete on table public.user_awards to service_role;

grant usage, select on sequence public.xp_ledger_seq_seq to service_role;

create or replace function private.xp_lock_key(p_scope text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended(p_scope, 9021773411::bigint);
$$;

create or replace function private.xp_manual_completion_points()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20;
$$;

create or replace function private.xp_cascade_multiplier()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 0.25::numeric;
$$;

create or replace function private.xp_goal_achievement_points()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 100;
$$;

create or replace function private.xp_points_for_completion_source(
  p_source public.completion_source
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source = 'linked_cascade'::public.completion_source
      then greatest(
        1,
        pg_catalog.floor(
          private.xp_manual_completion_points() * private.xp_cascade_multiplier()
        )::integer
      )
    else private.xp_manual_completion_points()
  end;
$$;

create or replace function private.xp_level_for_total(p_total_xp integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select level
      from public.xp_levels
      where min_total_xp <= greatest(coalesce(p_total_xp, 0), 0)
      order by level desc
      limit 1
    ),
    1
  );
$$;

create or replace function private.goal_anchored_period_start(
  p_anchor date,
  p_interval public.recurrence_interval,
  p_index integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month_start date;
begin
  if p_anchor is null or p_interval is null then
    raise exception
      using errcode = '22023',
            message = 'xp_period_anchor_required';
  end if;

  if p_index is null or p_index < 0 then
    raise exception
      using errcode = '22023',
            message = 'xp_period_index_out_of_range';
  end if;

  if p_interval = 'daily'::public.recurrence_interval then
    return p_anchor + p_index;
  end if;

  if p_interval = 'weekly'::public.recurrence_interval then
    return p_anchor + (p_index * 7);
  end if;

  v_month_start := (
    pg_catalog.date_trunc('month', p_anchor)
    + pg_catalog.make_interval(months => p_index)
  )::date;

  return v_month_start + (
    least(
      extract(day from p_anchor)::integer,
      extract(day from (v_month_start + interval '1 month - 1 day'))::integer
    ) - 1
  );
end;
$$;

create or replace function private.goal_period_key(
  p_anchor date,
  p_interval public.recurrence_interval,
  p_reference date
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reference date;
  v_index integer := 0;
  v_anchor_parts date;
begin
  if p_anchor is null or p_interval is null or p_reference is null then
    raise exception
      using errcode = '22023',
            message = 'xp_period_args_required';
  end if;

  v_reference := greatest(p_reference, p_anchor);

  if p_interval = 'daily'::public.recurrence_interval then
    v_index := v_reference - p_anchor;
    return private.goal_anchored_period_start(p_anchor, p_interval, v_index)::text;
  end if;

  if p_interval = 'weekly'::public.recurrence_interval then
    v_index := (v_reference - p_anchor) / 7;
    return private.goal_anchored_period_start(p_anchor, p_interval, v_index)::text;
  end if;

  v_index := greatest(
    0,
    (
      (extract(year from v_reference)::integer - extract(year from p_anchor)::integer) * 12
      + (extract(month from v_reference)::integer - extract(month from p_anchor)::integer)
    )
  );

  while (
    v_index > 0
    and private.goal_anchored_period_start(
      p_anchor,
      p_interval,
      v_index
    ) > v_reference
  ) loop
    v_index := v_index - 1;
  end loop;

  while (
    private.goal_anchored_period_start(
      p_anchor,
      p_interval,
      v_index + 1
    ) <= v_reference
  ) loop
    v_index := v_index + 1;
  end loop;

  v_anchor_parts := private.goal_anchored_period_start(p_anchor, p_interval, v_index);
  return v_anchor_parts::text;
end;
$$;

create or replace function private.goal_xp_credited_units(
  p_user_id uuid,
  p_goal_id uuid
)
returns table (
  source_key text,
  track_key text,
  event_type text,
  earned_on date,
  completion_id uuid,
  completion_source public.completion_source,
  xp_amount integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_goal record;
  v_timezone text;
  v_as_of date;
  v_credit_end date;
  v_target integer;
  v_interval public.recurrence_interval;
begin
  if p_user_id is null or p_goal_id is null then
    return;
  end if;

  select
    g.id,
    g.start_date,
    g.end_date,
    g.frequency_type,
    g.recurrence_interval,
    g.target_count,
    g.archived_at,
    g.is_deleted,
    g.category_key
  into v_goal
  from public.goals g
  where g.id = p_goal_id;

  if not found or v_goal.is_deleted then
    return;
  end if;

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = p_user_id;

  v_as_of := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  if v_goal.archived_at is not null then
    v_as_of := least(
      v_as_of,
      (v_goal.archived_at at time zone coalesce(v_timezone, 'UTC'))::date
    );
  end if;

  v_credit_end := least(v_as_of, coalesce(v_goal.end_date, v_as_of));
  if v_credit_end < v_goal.start_date then
    return;
  end if;

  if v_goal.frequency_type = 'fixed_milestones'::public.goal_frequency_type then
    v_target := greatest(1, coalesce(v_goal.target_count, 1));

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      ('milestone:' || credited.ordinal::text)::text as source_key,
      v_goal.category_key::text as track_key,
      'completion_credit'::text as event_type,
      credited.completed_on as earned_on,
      credited.completion_id,
      credited.completion_source,
      private.xp_points_for_completion_source(credited.completion_source) as xp_amount
    from credited
    order by credited.ordinal asc;

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      'achievement'::text as source_key,
      v_goal.category_key::text as track_key,
      'goal_achievement'::text as event_type,
      pg_catalog.max(credited.completed_on) as earned_on,
      null::uuid as completion_id,
      null::public.completion_source as completion_source,
      private.xp_goal_achievement_points() as xp_amount
    from credited
    having pg_catalog.count(*) >= v_target;

    return;
  end if;

  if (
    v_goal.frequency_type = 'recurring'::public.goal_frequency_type
    and coalesce(v_goal.target_count, 0) > 0
  ) then
    v_target := greatest(1, coalesce(v_goal.target_count, 1));

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      ('total:' || credited.ordinal::text)::text as source_key,
      v_goal.category_key::text as track_key,
      'completion_credit'::text as event_type,
      credited.completed_on as earned_on,
      credited.completion_id,
      credited.completion_source,
      private.xp_points_for_completion_source(credited.completion_source) as xp_amount
    from credited
    order by credited.ordinal asc;

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      'achievement'::text as source_key,
      v_goal.category_key::text as track_key,
      'goal_achievement'::text as event_type,
      pg_catalog.max(credited.completed_on) as earned_on,
      null::uuid as completion_id,
      null::public.completion_source as completion_source,
      private.xp_goal_achievement_points() as xp_amount
    from credited
    having pg_catalog.count(*) >= v_target;

    return;
  end if;

  v_interval := coalesce(v_goal.recurrence_interval, 'daily'::public.recurrence_interval);

  return query
  with admissible as (
    select
      c.id as completion_id,
      c.completed_on,
      c.source as completion_source,
      private.goal_period_key(v_goal.start_date, v_interval, c.completed_on) as period_key
    from public.completions c
    where c.user_id = p_user_id
      and c.goal_id = p_goal_id
      and c.completed_on between v_goal.start_date and v_credit_end
  ),
  credited as (
    select distinct on (a.period_key)
      a.completion_id,
      a.completed_on,
      a.completion_source,
      a.period_key
    from admissible a
    order by a.period_key asc, a.completed_on asc, a.completion_id asc
  )
  select
    ('cadence:' || credited.period_key)::text as source_key,
    v_goal.category_key::text as track_key,
    'completion_credit'::text as event_type,
    credited.completed_on as earned_on,
    credited.completion_id,
    credited.completion_source,
    private.xp_points_for_completion_source(credited.completion_source) as xp_amount
  from credited
  order by credited.period_key asc;
end;
$$;

create or replace function private.refresh_xp_profile(
  p_user_id uuid,
  p_track_keys text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_global_total integer;
  v_global_level integer;
  v_tracks text[];
  v_track text;
  v_track_total integer;
  v_track_level integer;
begin
  if p_user_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_user_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.xp.profile:' || p_user_id::text)
  );

  select coalesce(pg_catalog.sum(l.xp_delta), 0)::integer
  into v_global_total
  from public.xp_ledger l
  where l.user_id = p_user_id;

  if v_global_total < 0 then
    raise warning 'xp_anomaly kind=negative_total user=% detail=%',
      p_user_id,
      jsonb_build_object('track', 'global', 'total_xp', v_global_total);
  end if;

  v_global_level := private.xp_level_for_total(v_global_total);

  insert into public.xp_profiles (
    user_id,
    track_key,
    total_xp,
    current_level
  )
  values (
    p_user_id,
    'global',
    v_global_total,
    v_global_level
  )
  on conflict (user_id, track_key)
  do update
  set
    total_xp = excluded.total_xp,
    current_level = excluded.current_level,
    updated_at = pg_catalog.now();

  if p_track_keys is null or pg_catalog.cardinality(p_track_keys) = 0 then
    select pg_catalog.array_agg(distinct track_key order by track_key)
    into v_tracks
    from (
      select l.track_key
      from public.xp_ledger l
      where l.user_id = p_user_id
        and l.track_key <> 'global'
      union
      select p.track_key
      from public.xp_profiles p
      where p.user_id = p_user_id
        and p.track_key <> 'global'
    ) as track_set;
  else
    select pg_catalog.array_agg(distinct t order by t)
    into v_tracks
    from unnest(p_track_keys) as t
    where t is not null
      and pg_catalog.btrim(t) <> ''
      and t <> 'global';
  end if;

  if v_tracks is not null and pg_catalog.cardinality(v_tracks) > 0 then
    foreach v_track in array v_tracks loop
      select coalesce(pg_catalog.sum(l.xp_delta), 0)::integer
      into v_track_total
      from public.xp_ledger l
      where l.user_id = p_user_id
        and l.track_key = v_track;

      if v_track_total < 0 then
        raise warning 'xp_anomaly kind=negative_total user=% detail=%',
          p_user_id,
          jsonb_build_object('track', v_track, 'total_xp', v_track_total);
      end if;

      if v_track_total = 0 then
        delete from public.xp_profiles
        where user_id = p_user_id
          and track_key = v_track;
      else
        v_track_level := private.xp_level_for_total(v_track_total);
        insert into public.xp_profiles (
          user_id,
          track_key,
          total_xp,
          current_level
        )
        values (
          p_user_id,
          v_track,
          v_track_total,
          v_track_level
        )
        on conflict (user_id, track_key)
        do update
        set
          total_xp = excluded.total_xp,
          current_level = excluded.current_level,
          updated_at = pg_catalog.now();
      end if;
    end loop;
  end if;

  insert into public.user_awards (user_id, reward_id)
  select p_user_id, r.id
  from public.xp_rewards r
  where r.level <= v_global_level
  on conflict (user_id, reward_id) do nothing;

  update public.user_awards ua
  set revoked_at = coalesce(ua.revoked_at, pg_catalog.now())
  from public.xp_rewards r
  where ua.user_id = p_user_id
    and ua.reward_id = r.id
    and r.level > v_global_level
    and ua.revoked_at is null;
end;
$$;

create or replace function public.recompute_goal_xp_service(
  p_user_id uuid,
  p_goal_id uuid,
  p_force_zero boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows_written integer := 0;
  v_track_keys text[] := '{}'::text[];
  r record;
begin
  if p_user_id is null or p_goal_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_recompute_goal_args_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.xp:' || p_user_id::text || ':' || p_goal_id::text)
  );

  for r in
    with desired as (
      select *
      from private.goal_xp_credited_units(p_user_id, p_goal_id)
      where not p_force_zero
    ),
    current_balance as (
      select
        l.source_key,
        l.track_key,
        pg_catalog.min(l.event_type) as event_type,
        pg_catalog.max(l.earned_on) as earned_on,
        pg_catalog.sum(l.xp_delta)::integer as balance
      from public.xp_ledger l
      where l.user_id = p_user_id
        and l.goal_id = p_goal_id
      group by l.source_key, l.track_key
      having pg_catalog.sum(l.xp_delta) <> 0
    ),
    diff as (
      select
        coalesce(d.source_key, c.source_key) as source_key,
        coalesce(d.track_key, c.track_key) as track_key,
        coalesce(d.event_type, c.event_type) as event_type,
        coalesce(d.earned_on, c.earned_on) as earned_on,
        d.completion_id as completion_id,
        d.completion_source as completion_source,
        coalesce(d.xp_amount, 0) - coalesce(c.balance, 0) as xp_delta
      from desired d
      full outer join current_balance c
        on c.source_key = d.source_key
       and c.track_key = d.track_key
    )
    select *
    from diff
    where xp_delta <> 0
  loop
    insert into public.xp_ledger (
      user_id,
      goal_id,
      completion_id,
      track_key,
      event_type,
      entry_kind,
      source_key,
      xp_delta,
      earned_on,
      completion_source,
      metadata
    )
    values (
      p_user_id,
      p_goal_id,
      r.completion_id,
      r.track_key,
      r.event_type,
      case when r.xp_delta > 0 then 'award' else 'reversal' end,
      r.source_key,
      r.xp_delta,
      r.earned_on,
      r.completion_source,
      jsonb_build_object(
        'source', 'recompute_goal_xp_service',
        'force_zero', p_force_zero
      )
    );

    v_rows_written := v_rows_written + 1;
    v_track_keys := pg_catalog.array_append(v_track_keys, r.track_key);
  end loop;

  if v_rows_written > 20 then
    raise warning 'xp_anomaly kind=large_delta user=% detail=%',
      p_user_id,
      jsonb_build_object(
        'goal_id', p_goal_id,
        'rows_written', v_rows_written
      );
  end if;

  if v_rows_written > 0 then
    perform private.refresh_xp_profile(p_user_id, v_track_keys);
  end if;

  return v_rows_written;
end;
$$;

create or replace function public.award_social_xp_service(
  p_user_id uuid,
  p_event_type text,
  p_source_key text,
  p_xp integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_earned_on date;
  v_seq bigint;
begin
  if p_user_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_user_required';
  end if;

  if p_event_type not in ('challenge_award', 'season_award') then
    raise exception
      using errcode = '22023',
            message = 'invalid_social_event_type';
  end if;

  if p_xp = 0 then
    raise exception
      using errcode = '22023',
            message = 'invalid_xp_delta';
  end if;

  if p_source_key is null or pg_catalog.length(pg_catalog.btrim(p_source_key)) = 0 then
    raise exception
      using errcode = '22023',
            message = 'social_source_key_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.xp:' || p_user_id::text || ':social')
  );

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = p_user_id;

  v_earned_on := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  insert into public.xp_ledger (
    user_id,
    goal_id,
    completion_id,
    track_key,
    event_type,
    entry_kind,
    source_key,
    xp_delta,
    earned_on,
    completion_source,
    metadata
  )
  values (
    p_user_id,
    null,
    null,
    'global',
    p_event_type,
    case when p_xp > 0 then 'award' else 'reversal' end,
    pg_catalog.btrim(p_source_key),
    p_xp,
    v_earned_on,
    null,
    jsonb_build_object('source', 'award_social_xp_service')
  )
  on conflict (user_id, event_type, source_key)
  where goal_id is null
  do nothing
  returning seq into v_seq;

  if v_seq is not null then
    perform private.refresh_xp_profile(p_user_id, array['global']);
  end if;

  return v_seq;
end;
$$;

create or replace function public.acknowledge_user_award_service(
  p_user_id uuid,
  p_award_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_user uuid;
begin
  if p_user_id is null or p_award_id is null then
    raise exception
      using errcode = '22023',
            message = 'award_acknowledge_args_required';
  end if;

  v_claim_user := auth.uid();
  if v_claim_user is not null and v_claim_user <> p_user_id then
    raise exception
      using errcode = '42501',
            message = 'award_not_owned';
  end if;

  update public.user_awards
  set acknowledged_at = pg_catalog.now()
  where id = p_award_id
    and user_id = p_user_id
    and acknowledged_at is null;

  if found then
    return true;
  end if;

  return exists (
    select 1
    from public.user_awards ua
    where ua.id = p_award_id
      and ua.user_id = p_user_id
  );
end;
$$;

create or replace function public.assert_xp_ledger_consistency_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    with ledger as (
      select
        user_id,
        track_key,
        pg_catalog.sum(xp_delta)::integer as ledger_total
      from public.xp_ledger
      group by user_id, track_key
    ),
    global_ledger as (
      select
        user_id,
        'global'::text as track_key,
        pg_catalog.sum(xp_delta)::integer as ledger_total
      from public.xp_ledger
      group by user_id
    ),
    expected as (
      select * from global_ledger
      union all
      select * from ledger where track_key <> 'global'
    )
    select
      coalesce(e.user_id, p.user_id) as user_id,
      coalesce(e.track_key, p.track_key) as track_key,
      coalesce(e.ledger_total, 0) as ledger_total,
      coalesce(p.total_xp, 0) as profile_total
    from expected e
    full outer join public.xp_profiles p
      on p.user_id = e.user_id
     and p.track_key = e.track_key
    where coalesce(e.ledger_total, 0) <> coalesce(p.total_xp, 0)
  loop
    v_count := v_count + 1;
    raise warning 'xp_anomaly kind=drift user=% track=% ledger=% profile=% delta=%',
      r.user_id,
      r.track_key,
      r.ledger_total,
      r.profile_total,
      r.ledger_total - r.profile_total;
  end loop;

  return v_count;
end;
$$;

create or replace function private.xp_skip_for_profile_delete(
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select pg_catalog.current_setting(
    'app.planner_deleting_profile_id',
    true
  ) = p_user_id::text;
$$;

create or replace function private.sync_goal_xp_from_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if private.xp_skip_for_profile_delete(new.user_id) then
      return null;
    end if;
    perform public.recompute_goal_xp_service(new.user_id, new.goal_id);
    return null;
  end if;

  if tg_op = 'DELETE' then
    if private.xp_skip_for_profile_delete(old.user_id) then
      return null;
    end if;
    perform public.recompute_goal_xp_service(old.user_id, old.goal_id);
    return null;
  end if;

  if old.user_id = new.user_id and old.goal_id = new.goal_id then
    if private.xp_skip_for_profile_delete(new.user_id) then
      return null;
    end if;
    perform public.recompute_goal_xp_service(new.user_id, new.goal_id);
    return null;
  end if;

  if not private.xp_skip_for_profile_delete(old.user_id) then
    perform public.recompute_goal_xp_service(old.user_id, old.goal_id);
  end if;
  if not private.xp_skip_for_profile_delete(new.user_id) then
    perform public.recompute_goal_xp_service(new.user_id, new.goal_id);
  end if;
  return null;
end;
$$;

create or replace function private.sync_goal_xp_from_goal_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not (
    old.target_count is distinct from new.target_count
    or old.start_date is distinct from new.start_date
    or old.end_date is distinct from new.end_date
    or old.frequency_type is distinct from new.frequency_type
    or old.recurrence_interval is distinct from new.recurrence_interval
    or old.is_deleted is distinct from new.is_deleted
    or old.archived_at is distinct from new.archived_at
    or old.category_key is distinct from new.category_key
    or old.owner_id is distinct from new.owner_id
  ) then
    return null;
  end if;

  for r in
    select distinct c.user_id
    from public.completions c
    where c.goal_id = new.id
  loop
    if private.xp_skip_for_profile_delete(r.user_id) then
      continue;
    end if;

    perform public.recompute_goal_xp_service(r.user_id, new.id);
  end loop;

  return null;
end;
$$;

create or replace function private.reverse_goal_xp_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct c.user_id
    from public.completions c
    where c.goal_id = old.id
  loop
    if private.xp_skip_for_profile_delete(r.user_id) then
      continue;
    end if;

    perform public.recompute_goal_xp_service(
      r.user_id,
      old.id,
      true
    );
  end loop;

  return old;
end;
$$;

create or replace function private.initialize_xp_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.xp_skip_for_profile_delete(new.id) then
    return null;
  end if;

  perform private.refresh_xp_profile(new.id, array['global']);
  return null;
end;
$$;

drop trigger if exists completions_xp_recompute
on public.completions;
create trigger completions_xp_recompute
after insert or update or delete
on public.completions
for each row execute function private.sync_goal_xp_from_completion();

drop trigger if exists goals_xp_recompute
on public.goals;
create trigger goals_xp_recompute
after update
on public.goals
for each row execute function private.sync_goal_xp_from_goal_update();

drop trigger if exists goals_xp_reverse_on_delete
on public.goals;
create trigger goals_xp_reverse_on_delete
before delete
on public.goals
for each row execute function private.reverse_goal_xp_before_delete();

drop trigger if exists profiles_xp_initialize
on public.profiles;
create trigger profiles_xp_initialize
after insert
on public.profiles
for each row execute function private.initialize_xp_profile_for_user();

revoke all on function private.assert_xp_levels_monotonic() from public, anon, authenticated;
revoke all on function private.xp_lock_key(text) from public, anon, authenticated;
revoke all on function private.xp_manual_completion_points() from public, anon, authenticated;
revoke all on function private.xp_cascade_multiplier() from public, anon, authenticated;
revoke all on function private.xp_goal_achievement_points() from public, anon, authenticated;
revoke all on function private.xp_points_for_completion_source(public.completion_source)
  from public, anon, authenticated;
revoke all on function private.xp_level_for_total(integer) from public, anon, authenticated;
revoke all on function private.goal_anchored_period_start(date, public.recurrence_interval, integer)
  from public, anon, authenticated;
revoke all on function private.goal_period_key(date, public.recurrence_interval, date)
  from public, anon, authenticated;
revoke all on function private.goal_xp_credited_units(uuid, uuid) from public, anon, authenticated;
revoke all on function private.refresh_xp_profile(uuid, text[]) from public, anon, authenticated;
revoke all on function private.xp_skip_for_profile_delete(uuid) from public, anon, authenticated;
revoke all on function private.sync_goal_xp_from_completion() from public, anon, authenticated;
revoke all on function private.sync_goal_xp_from_goal_update() from public, anon, authenticated;
revoke all on function private.reverse_goal_xp_before_delete() from public, anon, authenticated;
revoke all on function private.initialize_xp_profile_for_user() from public, anon, authenticated;

revoke all on function public.recompute_goal_xp_service(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.recompute_goal_xp_service(uuid, uuid, boolean)
  to service_role;

revoke all on function public.award_social_xp_service(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.award_social_xp_service(uuid, text, text, integer)
  to service_role;

revoke all on function public.acknowledge_user_award_service(uuid, uuid)
  from public, anon;
grant execute on function public.acknowledge_user_award_service(uuid, uuid)
  to authenticated;
grant execute on function public.acknowledge_user_award_service(uuid, uuid)
  to service_role;

revoke all on function public.assert_xp_ledger_consistency_service()
  from public, anon, authenticated;
grant execute on function public.assert_xp_ledger_consistency_service()
  to service_role;

insert into public.xp_profiles (
  user_id,
  track_key,
  total_xp,
  current_level
)
select
  p.id,
  'global',
  0,
  private.xp_level_for_total(0)
from public.profiles p
on conflict (user_id, track_key) do nothing;

do $$
declare
  r record;
begin
  for r in
    select distinct c.user_id, c.goal_id
    from public.completions c
    join public.goals g
      on g.id = c.goal_id
  loop
    perform public.recompute_goal_xp_service(r.user_id, r.goal_id);
  end loop;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is null then
    return;
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'xp-drift-check-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'xp-drift-check-daily',
    '23 4 * * *',
    $xp$
      select public.assert_xp_ledger_consistency_service();
    $xp$
  );
end;
$$;
