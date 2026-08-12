-- Social Phase 3:
-- Social feed materialization, emission triggers, and read/modeation RPCs.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'feed_event_type'
  ) then
    create type public.feed_event_type as enum (
      'xp_earned',
      'level_up',
      'goal_achieved',
      'challenge_completed',
      'season_result',
      'team_formed'
    );
  end if;
end;
$$;

create table if not exists public.feed_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type public.feed_event_type not null,
  subject_key text not null,
  bucket_date date not null,
  track_key text,
  goal_id uuid references public.goals(id) on delete set null,
  xp_delta integer not null default 0,
  occurrence_count integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  reaction_count integer not null default 0,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles(id) on delete set null,
  hidden_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint feed_events_subject_key_len
    check (pg_catalog.char_length(subject_key) between 1 and 120),
  constraint feed_events_payload_object
    check (pg_catalog.jsonb_typeof(payload) = 'object'),
  constraint feed_events_payload_octets
    check (pg_catalog.octet_length(payload::text) <= 4096),
  constraint feed_events_counts_positive
    check (occurrence_count > 0),
  constraint feed_events_hidden_pair
    check ((hidden_at is null) = (hidden_by is null))
);

create unique index if not exists feed_events_coalesce_key
  on public.feed_events (actor_id, event_type, subject_key, bucket_date);

create index if not exists feed_events_visible_idx
  on public.feed_events (created_at desc, id desc)
  where hidden_at is null;

create index if not exists feed_events_actor_idx
  on public.feed_events (actor_id, created_at desc);

drop trigger if exists set_feed_events_updated_at
on public.feed_events;
create trigger set_feed_events_updated_at
before update on public.feed_events
for each row execute function public.set_updated_at();

alter table public.feed_events enable row level security;
revoke all on table public.feed_events from public, anon, authenticated;
grant select, insert, update, delete on table public.feed_events to service_role;

create or replace function private.local_today_for_profile(p_user_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select private.local_today_for_timezone(coalesce(profile.timezone, 'UTC'))
  from public.profiles profile
  where profile.id = p_user_id;
$$;

create or replace function private.emit_feed_event(
  p_actor_id uuid,
  p_event_type public.feed_event_type,
  p_subject_key text,
  p_bucket_date date default null,
  p_track_key text default null,
  p_goal_id uuid default null,
  p_xp_delta integer default 0,
  p_occurrence_delta integer default 1,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket_date date := coalesce(
    p_bucket_date,
    private.local_today_for_profile(p_actor_id),
    current_date
  );
  v_event_id uuid;
  v_actor_visible boolean;
begin
  select profile.social_activity_visible
  into v_actor_visible
  from public.profiles profile
  where profile.id = p_actor_id;

  if coalesce(v_actor_visible, false) = false then
    return null;
  end if;

  if p_occurrence_delta = 0 then
    return null;
  end if;

  insert into public.feed_events (
    actor_id,
    event_type,
    subject_key,
    bucket_date,
    track_key,
    goal_id,
    xp_delta,
    occurrence_count,
    payload
  )
  values (
    p_actor_id,
    p_event_type,
    p_subject_key,
    v_bucket_date,
    p_track_key,
    p_goal_id,
    p_xp_delta,
    greatest(p_occurrence_delta, 1),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (actor_id, event_type, subject_key, bucket_date) do update
    set
      xp_delta = public.feed_events.xp_delta + excluded.xp_delta,
      occurrence_count = public.feed_events.occurrence_count + p_occurrence_delta,
      goal_id = case
        when public.feed_events.goal_id is distinct from excluded.goal_id then null
        else public.feed_events.goal_id
      end,
      payload = coalesce(excluded.payload, public.feed_events.payload),
      updated_at = pg_catalog.now()
  returning id into v_event_id;

  if p_occurrence_delta < 0 or p_xp_delta < 0 then
    delete from public.feed_events event
    where event.id = v_event_id
      and (event.occurrence_count <= 0 or event.xp_delta <= 0);
  end if;

  return v_event_id;
end;
$$;

-- Feed emission helpers invoked explicitly from XP RPCs (no DB triggers).
create or replace function private.emit_feed_for_xp_ledger_row(
  p_user_id uuid,
  p_event_type text,
  p_track_key text,
  p_goal_id uuid,
  p_xp_delta integer,
  p_earned_on date,
  p_source_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feed_event_type public.feed_event_type;
  v_subject_key text;
  v_occurrence_delta integer := 1;
begin
  if p_event_type not in ('completion_credit', 'goal_achievement') then
    return null;
  end if;

  if p_event_type = 'completion_credit' then
    v_feed_event_type := 'xp_earned'::public.feed_event_type;
    v_subject_key := coalesce(p_track_key, 'other');
  else
    v_feed_event_type := 'goal_achieved'::public.feed_event_type;
    v_subject_key := coalesce(p_goal_id::text, 'goal');
  end if;

  if p_xp_delta < 0 then
    v_occurrence_delta := -1;
  end if;

  return private.emit_feed_event(
    p_actor_id => p_user_id,
    p_event_type => v_feed_event_type,
    p_subject_key => v_subject_key,
    p_bucket_date => p_earned_on,
    p_track_key => p_track_key,
    p_goal_id => p_goal_id,
    p_xp_delta => p_xp_delta,
    p_occurrence_delta => v_occurrence_delta,
    p_payload => jsonb_build_object(
      'eventType', p_event_type,
      'sourceKey', p_source_key
    )
  );
end;
$$;

create or replace function private.emit_feed_for_xp_level_up(
  p_user_id uuid,
  p_track_key text,
  p_previous_level integer,
  p_current_level integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket_date date;
begin
  if p_current_level is null or p_previous_level is null then
    return null;
  end if;
  if p_current_level <= p_previous_level then
    return null;
  end if;

  select private.local_today_for_profile(p_user_id)
  into v_bucket_date;

  return private.emit_feed_event(
    p_actor_id => p_user_id,
    p_event_type => 'level_up'::public.feed_event_type,
    p_subject_key => p_track_key || ':' || p_current_level::text,
    p_bucket_date => coalesce(v_bucket_date, current_date),
    p_track_key => p_track_key,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object(
      'trackKey', p_track_key,
      'level', p_current_level
    )
  );
end;
$$;

create or replace function public.get_social_feed(
  p_scope text default 'global',
  p_scope_id uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  event_type public.feed_event_type,
  created_at timestamptz,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
  track_key text,
  category_label text,
  goal_title text,
  xp_delta integer,
  occurrence_count integer,
  reaction_count integer,
  viewer_reacted boolean,
  payload jsonb,
  hidden_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_team_partner_id uuid := null;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_scope not in ('global', 'actor', 'team') then
    raise exception using errcode = '22023', message = 'invalid_feed_scope';
  end if;

  -- Team scope is wired in a later migration once public.teams exists.
  if p_scope = 'team' then
    v_team_partner_id := null;
  end if;

  return query
  select
    event.id,
    event.event_type,
    event.created_at,
    event.actor_id,
    actor.username,
    actor.display_name,
    actor.avatar_url,
    event.track_key,
    category.label,
    case
      when goal.id is not null
        and goal.is_private = false
        and goal.is_deleted = false
        and goal.archived_at is null
      then goal.title
      else null
    end as goal_title,
    event.xp_delta,
    event.occurrence_count,
    event.reaction_count,
    false as viewer_reacted,
    event.payload,
    event.hidden_at
  from public.feed_events event
  join public.profiles actor
    on actor.id = event.actor_id
  left join public.goals goal
    on goal.id = event.goal_id
  left join public.goal_categories category
    on category.key = event.track_key
  where (
      event.hidden_at is null
      or (
        p_scope = 'actor'
        and p_scope_id = v_uid
        and event.actor_id = v_uid
      )
    )
    and actor.social_activity_visible = true
    and (
      p_scope = 'global'
      or (
        p_scope = 'actor'
        and p_scope_id is not null
        and event.actor_id = p_scope_id
      )
      or (
        p_scope = 'team'
        and v_team_partner_id is not null
        and event.actor_id in (v_uid, v_team_partner_id)
      )
    )
    and (
      p_before_at is null
      or p_before_id is null
      or (event.created_at, event.id) < (p_before_at, p_before_id)
    )
  order by event.created_at desc, event.id desc
  limit v_limit;
end;
$$;

create or replace function public.hide_feed_event_service(
  p_event_id uuid,
  p_hidden boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_admin_username text := null;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  select public.is_platform_admin('moderator'::public.admin_role)
  into v_is_admin;
  if coalesce(v_is_admin, false) = false then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select profile.username
  into v_admin_username
  from public.profiles profile
  where profile.id = v_uid;

  update public.feed_events event
  set
    hidden_at = case when p_hidden then pg_catalog.now() else null end,
    hidden_by = case when p_hidden then v_uid else null end,
    hidden_reason = case when p_hidden then nullif(btrim(coalesce(p_reason, '')), '') else null end,
    updated_at = pg_catalog.now()
  where event.id = p_event_id;

  if not found then
    return false;
  end if;

  insert into public.moderation_actions (
    admin_id,
    admin_username,
    target_kind,
    target_id,
    action,
    reason
  )
  values (
    v_uid,
    coalesce(v_admin_username, 'unknown'),
    'feed_event'::public.moderation_target,
    p_event_id,
    case
      when p_hidden then 'hide'::public.moderation_action
      else 'unhide'::public.moderation_action
    end,
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  return true;
end;
$$;

revoke all on function private.local_today_for_profile(uuid)
  from public, anon, authenticated;
revoke all on function private.emit_feed_for_xp_ledger_row(
  uuid, text, text, uuid, integer, date, text
) from public, anon, authenticated;
revoke all on function private.emit_feed_for_xp_level_up(
  uuid, text, integer, integer
) from public, anon, authenticated;

revoke all on function private.emit_feed_event(
  uuid,
  public.feed_event_type,
  text,
  date,
  text,
  uuid,
  integer,
  integer,
  jsonb
) from public, anon, authenticated;
revoke all on function public.get_social_feed(
  text,
  uuid,
  timestamptz,
  uuid,
  integer
) from public, anon;
grant execute on function public.get_social_feed(
  text,
  uuid,
  timestamptz,
  uuid,
  integer
) to authenticated;
revoke all on function public.hide_feed_event_service(uuid, boolean, text)
  from public, anon;
grant execute on function public.hide_feed_event_service(uuid, boolean, text)
  to authenticated;
grant execute on function public.hide_feed_event_service(uuid, boolean, text)
  to service_role;

do $cron$
begin
  begin
    perform cron.unschedule('prune-feed-events-daily');
  exception
    when others then null;
  end;
  perform cron.schedule(
    'prune-feed-events-daily',
    '17 3 * * *',
    $job$delete from public.feed_events
      where created_at < pg_catalog.now() - interval '90 days'$job$
  );
exception
  when others then null;
end;
$cron$;
