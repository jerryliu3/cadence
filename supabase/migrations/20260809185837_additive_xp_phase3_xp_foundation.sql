-- XP Phase 3:
-- Add XP ledger/profile foundation with recompute-and-diff goal sync.

create table if not exists public.xp_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_xp integer not null default 0,
  current_level integer not null default 1,
  next_level_xp integer not null default 100,
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'xp_profiles_level_positive'
      and conrelid = 'public.xp_profiles'::regclass
  ) then
    alter table public.xp_profiles
    add constraint xp_profiles_level_positive
    check (current_level >= 1 and next_level_xp >= 100);
  end if;
end;
$$;

drop trigger if exists set_xp_profiles_updated_at
on public.xp_profiles;
create trigger set_xp_profiles_updated_at
before update on public.xp_profiles
for each row execute function public.set_updated_at();

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  completion_id uuid references public.completions(id) on delete set null,
  track_key text not null,
  entry_kind text not null,
  xp_delta integer not null,
  earned_on date not null,
  source_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'xp_ledger_track_key_format'
      and conrelid = 'public.xp_ledger'::regclass
  ) then
    alter table public.xp_ledger
    add constraint xp_ledger_track_key_format
    check (track_key ~ '^[a-z][a-z0-9_]{1,31}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'xp_ledger_entry_kind_enum'
      and conrelid = 'public.xp_ledger'::regclass
  ) then
    alter table public.xp_ledger
    add constraint xp_ledger_entry_kind_enum
    check (
      entry_kind in (
        'goal_completion_credit',
        'goal_completion_reversal',
        'social_award',
        'social_reversal'
      )
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'xp_ledger_non_zero_delta'
      and conrelid = 'public.xp_ledger'::regclass
  ) then
    alter table public.xp_ledger
    add constraint xp_ledger_non_zero_delta
    check (xp_delta <> 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'xp_ledger_goal_entries_have_goal'
      and conrelid = 'public.xp_ledger'::regclass
  ) then
    alter table public.xp_ledger
    add constraint xp_ledger_goal_entries_have_goal
    check (
      (
        entry_kind in ('goal_completion_credit', 'goal_completion_reversal')
        and goal_id is not null
      )
      or (
        entry_kind in ('social_award', 'social_reversal')
      )
    );
  end if;
end;
$$;

create unique index if not exists xp_ledger_source_event_unique_idx
on public.xp_ledger (user_id, source_event_id)
where source_event_id is not null;

create index if not exists xp_ledger_user_created_idx
on public.xp_ledger (user_id, created_at desc);

create index if not exists xp_ledger_user_goal_idx
on public.xp_ledger (user_id, goal_id)
where goal_id is not null;

alter table public.xp_profiles enable row level security;
alter table public.xp_ledger enable row level security;

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

revoke insert, update, delete on table public.xp_profiles from anon;
revoke insert, update, delete on table public.xp_profiles from authenticated;
grant select on table public.xp_profiles to authenticated;

revoke insert, update, delete on table public.xp_ledger from anon;
revoke insert, update, delete on table public.xp_ledger from authenticated;
grant select on table public.xp_ledger to authenticated;

create or replace function private.xp_lock_key(p_scope text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.hashtextextended(p_scope, 0);
$$;

create or replace function private.local_today_for_user(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.local_today_for_timezone(
    coalesce(
      (
        select p.timezone
        from public.profiles p
        where p.id = p_user_id
      ),
      'UTC'
    )
  );
$$;

create or replace function private.xp_level_for_total(p_total_xp integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, floor(greatest(coalesce(p_total_xp, 0), 0) / 100.0)::integer + 1);
$$;

create or replace function public.refresh_xp_profile(p_user_id uuid)
returns table (
  total_xp integer,
  current_level integer,
  next_level_xp integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_xp integer;
  v_current_level integer;
  v_next_level_xp integer;
begin
  if p_user_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_user_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key(format('resolution.xp.profile:%s', p_user_id::text))
  );

  select coalesce(sum(l.xp_delta), 0)::integer
  into v_total_xp
  from public.xp_ledger l
  where l.user_id = p_user_id;

  v_current_level := private.xp_level_for_total(v_total_xp);
  v_next_level_xp := v_current_level * 100;

  insert into public.xp_profiles (
    user_id,
    total_xp,
    current_level,
    next_level_xp,
    last_refreshed_at
  )
  values (
    p_user_id,
    v_total_xp,
    v_current_level,
    v_next_level_xp,
    now()
  )
  on conflict (user_id)
  do update
  set
    total_xp = excluded.total_xp,
    current_level = excluded.current_level,
    next_level_xp = excluded.next_level_xp,
    last_refreshed_at = excluded.last_refreshed_at;

  return query
  select v_total_xp, v_current_level, v_next_level_xp;
end;
$$;

create or replace function public.recompute_goal_xp_service(
  p_user_id uuid,
  p_goal_id uuid
)
returns table (
  target_xp integer,
  ledger_xp integer,
  delta_applied integer,
  total_xp integer,
  current_level integer,
  next_level_xp integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal_category_key text;
  v_completion_count integer;
  v_target_xp integer;
  v_ledger_xp integer;
  v_delta integer;
  v_profile record;
  v_earned_on date;
begin
  if p_user_id is null or p_goal_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_recompute_goal_args_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key(format('resolution.xp:%s:%s', p_user_id::text, p_goal_id::text))
  );

  select g.category_key
  into v_goal_category_key
  from public.goals g
  where g.id = p_goal_id;

  if v_goal_category_key is null then
    raise exception
      using errcode = 'P0001',
            message = 'unknown_goal';
  end if;

  select count(*)::integer
  into v_completion_count
  from public.completions c
  where c.user_id = p_user_id
    and c.goal_id = p_goal_id;

  v_target_xp := v_completion_count * 10;

  select coalesce(sum(l.xp_delta), 0)::integer
  into v_ledger_xp
  from public.xp_ledger l
  where l.user_id = p_user_id
    and l.goal_id = p_goal_id
    and l.entry_kind in ('goal_completion_credit', 'goal_completion_reversal');

  v_delta := v_target_xp - v_ledger_xp;
  v_earned_on := private.local_today_for_user(p_user_id);

  if v_delta <> 0 then
    insert into public.xp_ledger (
      user_id,
      goal_id,
      track_key,
      entry_kind,
      xp_delta,
      earned_on,
      metadata
    )
    values (
      p_user_id,
      p_goal_id,
      v_goal_category_key,
      case
        when v_delta > 0 then 'goal_completion_credit'
        else 'goal_completion_reversal'
      end,
      v_delta,
      v_earned_on,
      jsonb_build_object(
        'completion_count', v_completion_count,
        'recompute', true
      )
    );
  end if;

  select *
  into v_profile
  from public.refresh_xp_profile(p_user_id);

  return query
  select
    v_target_xp,
    v_ledger_xp + v_delta,
    v_delta,
    v_profile.total_xp,
    v_profile.current_level,
    v_profile.next_level_xp;
end;
$$;

create or replace function public.award_social_xp_service(
  p_user_id uuid,
  p_xp_delta integer,
  p_track_key text default 'global',
  p_reason text default null,
  p_source_event_id text default null,
  p_earned_on date default null
)
returns table (
  applied boolean,
  total_xp integer,
  current_level integer,
  next_level_xp integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track_key text;
  v_earned_on date;
  v_existing_entry_id uuid;
  v_profile record;
begin
  if p_user_id is null then
    raise exception
      using errcode = '22023',
            message = 'xp_user_required';
  end if;

  if p_xp_delta = 0 then
    raise exception
      using errcode = '22023',
            message = 'invalid_xp_delta';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key(format('resolution.xp:%s:social', p_user_id::text))
  );

  if p_source_event_id is not null then
    select l.id
    into v_existing_entry_id
    from public.xp_ledger l
    where l.user_id = p_user_id
      and l.source_event_id = p_source_event_id
    limit 1;
  end if;

  if v_existing_entry_id is null then
    v_track_key := coalesce(nullif(btrim(p_track_key), ''), 'global');
    v_earned_on := coalesce(p_earned_on, private.local_today_for_user(p_user_id));

    insert into public.xp_ledger (
      user_id,
      track_key,
      entry_kind,
      xp_delta,
      earned_on,
      source_event_id,
      metadata
    )
    values (
      p_user_id,
      v_track_key,
      case when p_xp_delta > 0 then 'social_award' else 'social_reversal' end,
      p_xp_delta,
      v_earned_on,
      p_source_event_id,
      jsonb_build_object('reason', nullif(btrim(p_reason), ''))
    );
  end if;

  select *
  into v_profile
  from public.refresh_xp_profile(p_user_id);

  return query
  select
    v_existing_entry_id is null,
    v_profile.total_xp,
    v_profile.current_level,
    v_profile.next_level_xp;
end;
$$;

create or replace function private.sync_goal_xp_from_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_goal_xp_service(new.user_id, new.goal_id);
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.recompute_goal_xp_service(old.user_id, old.goal_id);
    return null;
  end if;

  if old.user_id = new.user_id and old.goal_id = new.goal_id then
    perform public.recompute_goal_xp_service(new.user_id, new.goal_id);
    return null;
  end if;

  perform public.recompute_goal_xp_service(old.user_id, old.goal_id);
  perform public.recompute_goal_xp_service(new.user_id, new.goal_id);
  return null;
end;
$$;

drop trigger if exists completions_sync_goal_xp
on public.completions;
create trigger completions_sync_goal_xp
after insert or update of user_id, goal_id, completed_on or delete
on public.completions
for each row execute function private.sync_goal_xp_from_completion();

revoke all on function public.refresh_xp_profile(uuid) from public;
revoke all on function public.refresh_xp_profile(uuid) from anon;
revoke all on function public.refresh_xp_profile(uuid) from authenticated;
grant execute on function public.refresh_xp_profile(uuid) to service_role;

revoke all on function public.recompute_goal_xp_service(uuid, uuid) from public;
revoke all on function public.recompute_goal_xp_service(uuid, uuid) from anon;
revoke all on function public.recompute_goal_xp_service(uuid, uuid) from authenticated;
grant execute on function public.recompute_goal_xp_service(uuid, uuid) to service_role;

revoke all on function public.award_social_xp_service(
  uuid,
  integer,
  text,
  text,
  text,
  date
) from public;
revoke all on function public.award_social_xp_service(
  uuid,
  integer,
  text,
  text,
  text,
  date
) from anon;
revoke all on function public.award_social_xp_service(
  uuid,
  integer,
  text,
  text,
  text,
  date
) from authenticated;
grant execute on function public.award_social_xp_service(
  uuid,
  integer,
  text,
  text,
  text,
  date
) to service_role;
