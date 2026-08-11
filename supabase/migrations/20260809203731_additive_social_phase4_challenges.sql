-- Social Phase 4:
-- Challenge model, progress recompute, and participant lifecycle.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'challenge_metric'
  ) then
    create type public.challenge_metric as enum (
      'total_xp',
      'category_xp',
      'completions_count',
      'distinct_active_days',
      'max_streak_days'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'challenge_status'
  ) then
    create type public.challenge_status as enum (
      'draft',
      'scheduled',
      'active',
      'closed',
      'archived'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'challenge_enrollment'
  ) then
    create type public.challenge_enrollment as enum ('auto', 'opt_in');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'social_subject_kind'
  ) then
    create type public.social_subject_kind as enum ('user', 'duo');
  end if;
end;
$$;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  status public.challenge_status not null default 'draft',
  enrollment public.challenge_enrollment not null default 'opt_in',
  subject_kind public.social_subject_kind not null default 'user',
  metric public.challenge_metric not null,
  metric_track_key text references public.goal_categories(key) on update cascade,
  target_value numeric not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reward_xp integer not null default 0,
  max_participants integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint challenges_window check (ends_at > starts_at),
  constraint challenges_target_positive check (target_value > 0),
  constraint challenges_reward_nonneg check (reward_xp >= 0),
  constraint challenges_track_required check (
    metric <> 'category_xp'::public.challenge_metric
    or metric_track_key is not null
  ),
  constraint challenges_slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$')
);

create index if not exists challenges_active_idx
  on public.challenges (status, ends_at)
  where status = 'active';

drop trigger if exists set_challenges_updated_at
on public.challenges;
create trigger set_challenges_updated_at
before update on public.challenges
for each row execute function public.set_updated_at();

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  subject_kind public.social_subject_kind not null,
  subject_id uuid not null,
  joined_at timestamptz not null default pg_catalog.now(),
  progress_value numeric not null default 0,
  progress_at timestamptz,
  completed_at timestamptz,
  awarded_at timestamptz,
  primary key (challenge_id, subject_kind, subject_id)
);

create index if not exists challenge_participants_subject_idx
  on public.challenge_participants (subject_kind, subject_id);

create index if not exists challenge_participants_progress_idx
  on public.challenge_participants (challenge_id, progress_value desc);

create or replace function private.validate_challenge_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_exists boolean := false;
begin
  if new.subject_kind = 'user'::public.social_subject_kind then
    select exists(
      select 1
      from public.profiles profile
      where profile.id = new.subject_id
        and profile.social_competition_eligible = true
        and profile.leaderboard_banned_at is null
    )
    into v_exists;
  elsif new.subject_kind = 'duo'::public.social_subject_kind then
    if to_regclass('public.duos') is null then
      raise exception
        using errcode = '42P01',
              message = 'duos_not_available';
    end if;

    execute $duo$
      select exists(
        select 1
        from public.duos duo
        where duo.id = $1
          and duo.status = 'active'
      )
    $duo$
    into v_exists
    using new.subject_id;
  else
    raise exception
      using errcode = '22023',
            message = 'invalid_subject_kind';
  end if;

  if not v_exists then
    raise exception
      using errcode = '23503',
            message = 'challenge_participant_not_found_or_ineligible';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_challenge_participant_trigger
on public.challenge_participants;
create trigger validate_challenge_participant_trigger
before insert or update on public.challenge_participants
for each row
execute function private.validate_challenge_participant();

create or replace function private.challenge_progress_value(
  p_metric public.challenge_metric,
  p_track_key text,
  p_user_ids uuid[],
  p_from date,
  p_to date
)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_value numeric := 0;
begin
  if p_user_ids is null or pg_catalog.array_length(p_user_ids, 1) is null then
    return 0;
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    return 0;
  end if;

  if to_regclass('public.xp_ledger') is null then
    case p_metric
      when 'completions_count'::public.challenge_metric then
        select count(*)::numeric
        into v_value
        from public.completions completion
        where completion.user_id = any(p_user_ids)
          and completion.completed_on between p_from and p_to;
      when 'distinct_active_days'::public.challenge_metric then
        select count(distinct completion.completed_on)::numeric
        into v_value
        from public.completions completion
        where completion.user_id = any(p_user_ids)
          and completion.completed_on between p_from and p_to;
      when 'max_streak_days'::public.challenge_metric then
        with days as (
          select distinct completion.completed_on as active_on
          from public.completions completion
          where completion.user_id = any(p_user_ids)
            and completion.completed_on between p_from and p_to
        ),
        islands as (
          select
            active_on,
            active_on
            - ((row_number() over (order by active_on))::text || ' day')::interval as island_key
          from days
        )
        select coalesce(max(streak_days), 0)::numeric
        into v_value
        from (
          select count(*)::integer as streak_days
          from islands
          group by island_key
        ) streaks;
      else
        raise exception
          using errcode = '22023',
                message = 'unsupported_metric_without_xp';
    end case;

    return coalesce(v_value, 0);
  end if;

  case p_metric
    when 'total_xp'::public.challenge_metric then
      select coalesce(sum(ledger.xp_delta), 0)::numeric
      into v_value
      from public.xp_ledger ledger
      where ledger.user_id = any(p_user_ids)
        and ledger.earned_on between p_from and p_to
        and ledger.event_type in ('completion_credit', 'goal_achievement');
    when 'category_xp'::public.challenge_metric then
      select coalesce(sum(ledger.xp_delta), 0)::numeric
      into v_value
      from public.xp_ledger ledger
      where ledger.user_id = any(p_user_ids)
        and ledger.track_key = p_track_key
        and ledger.earned_on between p_from and p_to
        and ledger.event_type in ('completion_credit', 'goal_achievement');
    when 'completions_count'::public.challenge_metric then
      select count(*)::numeric
      into v_value
      from public.xp_ledger ledger
      where ledger.user_id = any(p_user_ids)
        and ledger.earned_on between p_from and p_to
        and ledger.event_type = 'completion_credit'
        and ledger.xp_delta > 0;
    when 'distinct_active_days'::public.challenge_metric then
      select count(distinct ledger.earned_on)::numeric
      into v_value
      from public.xp_ledger ledger
      where ledger.user_id = any(p_user_ids)
        and ledger.earned_on between p_from and p_to
        and ledger.event_type = 'completion_credit'
        and ledger.xp_delta > 0;
    when 'max_streak_days'::public.challenge_metric then
      with days as (
        select distinct ledger.earned_on as active_on
        from public.xp_ledger ledger
        where ledger.user_id = any(p_user_ids)
          and ledger.earned_on between p_from and p_to
          and ledger.event_type = 'completion_credit'
          and ledger.xp_delta > 0
      ),
      islands as (
        select
          active_on,
          active_on - (row_number() over (order by active_on))::integer as island_key
        from days
      )
      select coalesce(max(streak_days), 0)::numeric
      into v_value
      from (
        select count(*)::integer as streak_days
        from islands
        group by island_key
      ) streaks;
  end case;

  return coalesce(v_value, 0);
end;
$$;

create or replace function private.refresh_user_challenge_participant(
  p_challenge_id uuid,
  p_user_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_progress numeric;
  v_window_start date;
  v_window_end date;
  v_award_seq bigint;
  v_completed boolean := false;
begin
  if p_challenge_id is null or p_user_id is null then
    return false;
  end if;

  select challenge.*
  into v_challenge
  from public.challenges challenge
  where challenge.id = p_challenge_id;

  if not found then
    return false;
  end if;

  if v_challenge.subject_kind <> 'user'::public.social_subject_kind then
    return false;
  end if;

  if v_challenge.status not in ('active', 'closed') then
    return false;
  end if;

  v_window_start := (v_challenge.starts_at at time zone 'UTC')::date;
  v_window_end := (least(p_now, v_challenge.ends_at) at time zone 'UTC')::date;

  v_progress := private.challenge_progress_value(
    v_challenge.metric,
    v_challenge.metric_track_key,
    array[p_user_id]::uuid[],
    v_window_start,
    v_window_end
  );

  update public.challenge_participants participant
  set
    progress_value = v_progress,
    progress_at = p_now
  where participant.challenge_id = p_challenge_id
    and participant.subject_kind = 'user'::public.social_subject_kind
    and participant.subject_id = p_user_id;

  if not found then
    return false;
  end if;

  if v_challenge.status = 'active'
    and v_progress >= v_challenge.target_value then
    update public.challenge_participants participant
    set
      completed_at = coalesce(participant.completed_at, p_now)
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = 'user'::public.social_subject_kind
      and participant.subject_id = p_user_id
      and participant.completed_at is null;

    v_completed := found;

    if v_completed and v_challenge.reward_xp > 0 then
      select public.award_social_xp_service(
        p_user_id,
        'challenge_award',
        'challenge:' || p_challenge_id::text || ':user:' || p_user_id::text,
        v_challenge.reward_xp
      )
      into v_award_seq;

      if v_award_seq is not null then
        update public.challenge_participants participant
        set awarded_at = coalesce(participant.awarded_at, p_now)
        where participant.challenge_id = p_challenge_id
          and participant.subject_kind = 'user'::public.social_subject_kind
          and participant.subject_id = p_user_id;
      end if;
    end if;

    if v_completed then
      perform private.emit_feed_event(
        p_actor_id => p_user_id,
        p_event_type => 'challenge_completed'::public.feed_event_type,
        p_subject_key => p_challenge_id::text,
        p_bucket_date => (p_now at time zone 'UTC')::date,
        p_track_key => v_challenge.metric_track_key,
        p_goal_id => null,
        p_xp_delta => greatest(v_challenge.reward_xp, 0),
        p_occurrence_delta => 1,
        p_payload => jsonb_build_object(
          'challengeId', p_challenge_id,
          'metric', v_challenge.metric
        )
      );
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.refresh_challenge_progress_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_refreshed integer := 0;
  v_slots integer;
  r_challenge public.challenges%rowtype;
  r_participant record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.challenge_refresh')
  );

  update public.challenges challenge
  set
    status = 'active'::public.challenge_status,
    updated_at = v_now
  where challenge.status = 'scheduled'::public.challenge_status
    and challenge.starts_at <= v_now
    and challenge.ends_at > v_now;

  for r_challenge in
    select challenge.*
    from public.challenges challenge
    where challenge.status = 'active'::public.challenge_status
  loop
    if r_challenge.subject_kind = 'user'::public.social_subject_kind
      and r_challenge.enrollment = 'auto'::public.challenge_enrollment then
      if r_challenge.max_participants is null then
        insert into public.challenge_participants (
          challenge_id,
          subject_kind,
          subject_id
        )
        select
          r_challenge.id,
          'user'::public.social_subject_kind,
          profile.id
        from public.profiles profile
        where profile.social_competition_eligible = true
          and profile.leaderboard_banned_at is null
        on conflict (challenge_id, subject_kind, subject_id) do nothing;
      else
        select greatest(
          r_challenge.max_participants - count(*),
          0
        )::integer
        into v_slots
        from public.challenge_participants participant
        where participant.challenge_id = r_challenge.id
          and participant.subject_kind = 'user'::public.social_subject_kind;

        if v_slots > 0 then
          insert into public.challenge_participants (
            challenge_id,
            subject_kind,
            subject_id
          )
          select
            r_challenge.id,
            'user'::public.social_subject_kind,
            profile.id
          from public.profiles profile
          where profile.social_competition_eligible = true
            and profile.leaderboard_banned_at is null
          order by profile.created_at asc, profile.id asc
          limit v_slots
          on conflict (challenge_id, subject_kind, subject_id) do nothing;
        end if;
      end if;
    end if;

    for r_participant in
      select participant.subject_id
      from public.challenge_participants participant
      where participant.challenge_id = r_challenge.id
        and participant.subject_kind = 'user'::public.social_subject_kind
    loop
      if private.refresh_user_challenge_participant(
        r_challenge.id,
        r_participant.subject_id,
        v_now
      ) then
        v_refreshed := v_refreshed + 1;
      end if;
    end loop;

    if r_challenge.ends_at <= v_now then
      update public.challenges challenge
      set
        status = 'closed'::public.challenge_status,
        updated_at = v_now
      where challenge.id = r_challenge.id
        and challenge.status = 'active'::public.challenge_status;
    end if;
  end loop;

  return v_refreshed;
end;
$$;

create or replace function public.get_social_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  status public.challenge_status,
  enrollment public.challenge_enrollment,
  subject_kind public.social_subject_kind,
  metric public.challenge_metric,
  metric_track_key text,
  target_value numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  reward_xp integer,
  max_participants integer,
  participant_count integer,
  viewer_joined boolean,
  viewer_progress numeric,
  viewer_completed_at timestamptz,
  viewer_awarded_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  return query
  with participant_counts as (
    select
      participant.challenge_id,
      count(*)::integer as count_value
    from public.challenge_participants participant
    group by participant.challenge_id
  )
  select
    challenge.id,
    challenge.slug,
    challenge.title,
    challenge.description,
    challenge.status,
    challenge.enrollment,
    challenge.subject_kind,
    challenge.metric,
    challenge.metric_track_key,
    challenge.target_value,
    challenge.starts_at,
    challenge.ends_at,
    challenge.reward_xp,
    challenge.max_participants,
    coalesce(counts.count_value, 0) as participant_count,
    participant.subject_id is not null as viewer_joined,
    participant.progress_value as viewer_progress,
    participant.completed_at as viewer_completed_at,
    participant.awarded_at as viewer_awarded_at
  from public.challenges challenge
  left join participant_counts counts
    on counts.challenge_id = challenge.id
  left join public.challenge_participants participant
    on participant.challenge_id = challenge.id
    and participant.subject_kind = 'user'::public.social_subject_kind
    and participant.subject_id = v_uid
  where challenge.status in (
    'scheduled'::public.challenge_status,
    'active'::public.challenge_status,
    'closed'::public.challenge_status
  )
  order by
    case challenge.status
      when 'active'::public.challenge_status then 0
      when 'scheduled'::public.challenge_status then 1
      else 2
    end asc,
    challenge.starts_at desc;
end;
$$;

create or replace function public.get_challenge_detail(
  p_challenge_id uuid
)
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  status public.challenge_status,
  enrollment public.challenge_enrollment,
  subject_kind public.social_subject_kind,
  metric public.challenge_metric,
  metric_track_key text,
  target_value numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  reward_xp integer,
  max_participants integer,
  participant_count integer,
  viewer_joined boolean,
  viewer_progress numeric,
  viewer_completed_at timestamptz,
  viewer_awarded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  perform private.refresh_user_challenge_participant(p_challenge_id, v_uid, pg_catalog.now());

  return query
  with participant_counts as (
    select count(*)::integer as count_value
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
  )
  select
    challenge.id,
    challenge.slug,
    challenge.title,
    challenge.description,
    challenge.status,
    challenge.enrollment,
    challenge.subject_kind,
    challenge.metric,
    challenge.metric_track_key,
    challenge.target_value,
    challenge.starts_at,
    challenge.ends_at,
    challenge.reward_xp,
    challenge.max_participants,
    counts.count_value as participant_count,
    participant.subject_id is not null as viewer_joined,
    participant.progress_value as viewer_progress,
    participant.completed_at as viewer_completed_at,
    participant.awarded_at as viewer_awarded_at
  from public.challenges challenge
  cross join participant_counts counts
  left join public.challenge_participants participant
    on participant.challenge_id = challenge.id
    and participant.subject_kind = 'user'::public.social_subject_kind
    and participant.subject_id = v_uid
  where challenge.id = p_challenge_id
    and challenge.status in (
      'scheduled'::public.challenge_status,
      'active'::public.challenge_status,
      'closed'::public.challenge_status
    );
end;
$$;

create or replace function public.join_challenge_service(
  p_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_participant_count integer;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_uid
      and profile.social_competition_eligible = true
      and profile.leaderboard_banned_at is null
  ) then
    raise exception using errcode = '42501', message = 'challenge_not_eligible';
  end if;

  select challenge.*
  into v_challenge
  from public.challenges challenge
  where challenge.id = p_challenge_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'challenge_not_found';
  end if;

  if v_challenge.subject_kind <> 'user'::public.social_subject_kind then
    raise exception using errcode = '22023', message = 'challenge_subject_not_supported';
  end if;

  if v_challenge.status not in ('scheduled', 'active') then
    raise exception using errcode = '22023', message = 'challenge_not_joinable';
  end if;

  if v_challenge.max_participants is not null then
    select count(*)::integer
    into v_participant_count
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = 'user'::public.social_subject_kind;

    if v_participant_count >= v_challenge.max_participants
      and not exists (
        select 1
        from public.challenge_participants participant
        where participant.challenge_id = p_challenge_id
          and participant.subject_kind = 'user'::public.social_subject_kind
          and participant.subject_id = v_uid
      ) then
      raise exception using errcode = '22023', message = 'challenge_full';
    end if;
  end if;

  insert into public.challenge_participants (
    challenge_id,
    subject_kind,
    subject_id
  )
  values (
    p_challenge_id,
    'user'::public.social_subject_kind,
    v_uid
  )
  on conflict (challenge_id, subject_kind, subject_id) do nothing;

  if v_challenge.status = 'active'::public.challenge_status then
    perform private.refresh_user_challenge_participant(
      p_challenge_id,
      v_uid,
      pg_catalog.now()
    );
  end if;

  return exists (
    select 1
    from public.challenge_participants participant
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = 'user'::public.social_subject_kind
      and participant.subject_id = v_uid
  );
end;
$$;

create or replace function public.leave_challenge_service(
  p_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_enrollment public.challenge_enrollment;
  v_status public.challenge_status;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_challenge_id is null then
    raise exception using errcode = '22023', message = 'challenge_id_required';
  end if;

  select challenge.enrollment, challenge.status
  into v_enrollment, v_status
  from public.challenges challenge
  where challenge.id = p_challenge_id;

  if not found then
    raise exception using errcode = '22023', message = 'challenge_not_found';
  end if;

  if v_status not in ('scheduled', 'active') then
    raise exception using errcode = '22023', message = 'challenge_not_leaveable';
  end if;

  if v_enrollment <> 'opt_in'::public.challenge_enrollment then
    raise exception using errcode = '22023', message = 'challenge_auto_enrollment';
  end if;

  delete from public.challenge_participants participant
  where participant.challenge_id = p_challenge_id
    and participant.subject_kind = 'user'::public.social_subject_kind
    and participant.subject_id = v_uid
    and participant.completed_at is null;

  return found;
end;
$$;

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

revoke all on table public.challenges
  from public, anon, authenticated;
revoke all on table public.challenge_participants
  from public, anon, authenticated;
grant select, insert, update, delete on table public.challenges to service_role;
grant select, insert, update, delete on table public.challenge_participants to service_role;

revoke all on function private.validate_challenge_participant()
  from public, anon, authenticated;
revoke all on function private.challenge_progress_value(
  public.challenge_metric,
  text,
  uuid[],
  date,
  date
)
  from public, anon, authenticated;
revoke all on function private.refresh_user_challenge_participant(
  uuid,
  uuid,
  timestamptz
)
  from public, anon, authenticated;

revoke all on function public.refresh_challenge_progress_service()
  from public, anon, authenticated;
grant execute on function public.refresh_challenge_progress_service()
  to service_role;

revoke all on function public.get_social_challenges()
  from public, anon;
grant execute on function public.get_social_challenges()
  to authenticated;

revoke all on function public.get_challenge_detail(uuid)
  from public, anon;
grant execute on function public.get_challenge_detail(uuid)
  to authenticated;

revoke all on function public.join_challenge_service(uuid)
  from public, anon;
grant execute on function public.join_challenge_service(uuid)
  to authenticated;

revoke all on function public.leave_challenge_service(uuid)
  from public, anon;
grant execute on function public.leave_challenge_service(uuid)
  to authenticated;

do $cron$
begin
  begin
    perform cron.unschedule('refresh-challenge-progress');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'refresh-challenge-progress',
    '*/15 * * * *',
    $job$select public.refresh_challenge_progress_service()$job$
  );
exception
  when others then null;
end;
$cron$;
