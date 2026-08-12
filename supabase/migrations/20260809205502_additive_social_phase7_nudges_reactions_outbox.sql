-- Social Phase 7:
-- Team nudges, feed reactions, and durable notification outbox.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'nudge_kind'
  ) then
    create type public.nudge_kind as enum ('cheer', 'remind', 'custom');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'reaction_kind'
  ) then
    create type public.reaction_kind as enum ('cheer', 'fire', 'clap', 'strong');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'notification_channel'
  ) then
    create type public.notification_channel as enum ('push');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'notification_state'
  ) then
    create type public.notification_state as enum (
      'pending',
      'sent',
      'failed',
      'skipped'
    );
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'notification_kind'
  ) then
    create type public.notification_kind as enum (
      'team_invite',
      'team_accepted',
      'team_dissolved',
      'nudge',
      'reaction',
      'challenge_joined',
      'challenge_completed',
      'challenge_ending_soon',
      'season_closed',
      'planner_proposal',
      'planner_proposal_decided'
    );
  end if;
end;
$$;

create table if not exists public.team_preferences (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_completions boolean not null default true,
  allow_nudges boolean not null default true,
  notify_partner_activity boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (team_id, user_id)
);

alter table public.team_preferences
add column if not exists share_completions boolean not null default true;
alter table public.team_preferences
add column if not exists allow_nudges boolean not null default true;
alter table public.team_preferences
add column if not exists notify_partner_activity boolean not null default true;

insert into public.team_preferences (team_id, user_id)
select team.id, team.user_a_id
from public.teams team
where team.status = 'active'::public.team_status
on conflict (team_id, user_id) do nothing;

insert into public.team_preferences (team_id, user_id)
select team.id, team.user_b_id
from public.teams team
where team.status = 'active'::public.team_status
on conflict (team_id, user_id) do nothing;

drop trigger if exists set_team_preferences_updated_at on public.team_preferences;
create trigger set_team_preferences_updated_at
before update on public.team_preferences
for each row execute function public.set_updated_at();

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.nudge_kind not null default 'cheer',
  goal_id uuid references public.goals(id) on delete set null,
  message text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint nudges_distinct check (from_user_id <> to_user_id),
  constraint nudges_message_len check (
    message is null or pg_catalog.char_length(pg_catalog.btrim(message)) between 1 and 140
  ),
  constraint nudges_custom_needs_message check (
    kind <> 'custom'::public.nudge_kind or message is not null
  )
);

create index if not exists nudges_recipient_idx
  on public.nudges (to_user_id, created_at desc);
create index if not exists nudges_rate_idx
  on public.nudges (from_user_id, created_at desc);

create table if not exists public.feed_reactions (
  feed_event_id uuid not null references public.feed_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction public.reaction_kind not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (feed_event_id, user_id, reaction)
);

create index if not exists feed_reactions_user_idx
  on public.feed_reactions (user_id, created_at desc);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null,
  channel public.notification_channel not null default 'push',
  title text not null,
  body text not null,
  url text,
  dedupe_key text,
  state public.notification_state not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  available_at timestamptz not null default pg_catalog.now(),
  sent_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint notification_outbox_title_len
    check (pg_catalog.char_length(title) between 1 and 120),
  constraint notification_outbox_body_len
    check (pg_catalog.char_length(body) between 1 and 200)
);

create unique index if not exists notification_outbox_dedupe
  on public.notification_outbox (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (available_at)
  where state = 'pending';

create or replace function private.enqueue_notification_outbox(
  p_user_id uuid,
  p_kind public.notification_kind,
  p_title text,
  p_body text,
  p_url text default null,
  p_dedupe_key text default null,
  p_available_at timestamptz default pg_catalog.now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notification_outbox (
    user_id,
    kind,
    title,
    body,
    url,
    dedupe_key,
    available_at
  )
  values (
    p_user_id,
    p_kind,
    p_title,
    p_body,
    p_url,
    nullif(pg_catalog.btrim(coalesce(p_dedupe_key, '')), ''),
    coalesce(p_available_at, pg_catalog.now())
  )
  on conflict (user_id, dedupe_key)
  where dedupe_key is not null
  do update
    set available_at = excluded.available_at
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.partner_notifications_allowed(
  p_team_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select pref.notify_partner_activity
    from public.team_preferences pref
    where pref.team_id = p_team_id
      and pref.user_id = p_user_id
  ), true);
$$;

create or replace function public.add_feed_reaction_service(
  p_feed_event_id uuid,
  p_reaction public.reaction_kind
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor_id uuid;
  v_event_hidden_at timestamptz;
  v_actor_visible boolean;
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_feed_event_id is null then
    raise exception using errcode = '22023', message = 'feed_event_id_required';
  end if;

  select event.actor_id, event.hidden_at, actor.social_activity_visible
  into v_actor_id, v_event_hidden_at, v_actor_visible
  from public.feed_events event
  join public.profiles actor
    on actor.id = event.actor_id
  where event.id = p_feed_event_id;

  if not found then
    raise exception using errcode = '22023', message = 'feed_event_not_found';
  end if;
  if v_event_hidden_at is not null or coalesce(v_actor_visible, false) = false then
    raise exception using errcode = '42501', message = 'feed_event_not_visible';
  end if;

  insert into public.feed_reactions (feed_event_id, user_id, reaction)
  values (p_feed_event_id, v_uid, p_reaction)
  on conflict (feed_event_id, user_id, reaction) do nothing;

  if v_uid <> v_actor_id then
    select team.id
    into v_team_id
    from public.teams team
    where team.status = 'active'::public.team_status
      and (
        (team.user_a_id = v_uid and team.user_b_id = v_actor_id)
        or (team.user_a_id = v_actor_id and team.user_b_id = v_uid)
      )
    limit 1;

    if v_team_id is not null and private.partner_notifications_allowed(v_team_id, v_actor_id) then
      perform private.enqueue_notification_outbox(
        p_user_id => v_actor_id,
        p_kind => 'reaction'::public.notification_kind,
        p_title => 'Your activity got a reaction',
        p_body => 'Your partner reacted to one of your feed updates.',
        p_url => '/social',
        p_dedupe_key => 'reaction:' || p_feed_event_id::text || ':' || p_reaction::text || ':' || v_uid::text
      );
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.remove_feed_reaction_service(
  p_feed_event_id uuid,
  p_reaction public.reaction_kind
)
returns boolean
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
  if p_feed_event_id is null then
    raise exception using errcode = '22023', message = 'feed_event_id_required';
  end if;

  delete from public.feed_reactions reaction
  where reaction.feed_event_id = p_feed_event_id
    and reaction.user_id = v_uid
    and reaction.reaction = p_reaction;

  return found;
end;
$$;

create or replace function public.send_nudge_service(
  p_to_user_id uuid,
  p_kind public.nudge_kind default 'cheer',
  p_goal_id uuid default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_nudge_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_to_user_id is null or p_to_user_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_nudge_target';
  end if;

  select team.id
  into v_team_id
  from public.teams team
  where team.status = 'active'::public.team_status
    and (
      (team.user_a_id = v_uid and team.user_b_id = p_to_user_id)
      or (team.user_a_id = p_to_user_id and team.user_b_id = v_uid)
    )
  limit 1;

  if v_team_id is null then
    raise exception using errcode = '22023', message = 'team_required';
  end if;

  if not exists (
    select 1
    from public.team_preferences pref
    where pref.team_id = v_team_id
      and pref.user_id = p_to_user_id
      and pref.allow_nudges = true
  ) then
    raise exception using errcode = '42501', message = 'nudges_not_allowed';
  end if;

  if (
    select count(*)::integer
    from public.nudges nudge
    where nudge.from_user_id = v_uid
      and nudge.created_at >= pg_catalog.now() - interval '24 hours'
  ) >= 5 then
    raise exception using errcode = '42900', message = 'nudge_rate_limited_24h';
  end if;

  if exists (
    select 1
    from public.nudges nudge
    where nudge.from_user_id = v_uid
      and nudge.to_user_id = p_to_user_id
      and nudge.goal_id is not distinct from p_goal_id
      and nudge.created_at::date = current_date
  ) then
    raise exception using errcode = '42900', message = 'nudge_rate_limited_goal_daily';
  end if;

  if p_kind <> 'custom'::public.nudge_kind then
    v_message := null;
  elsif v_message is null then
    raise exception using errcode = '22023', message = 'custom_nudge_message_required';
  end if;

  insert into public.nudges (
    team_id,
    from_user_id,
    to_user_id,
    kind,
    goal_id,
    message
  )
  values (
    v_team_id,
    v_uid,
    p_to_user_id,
    p_kind,
    p_goal_id,
    v_message
  )
  returning id into v_nudge_id;

  if private.partner_notifications_allowed(v_team_id, p_to_user_id) then
    perform private.enqueue_notification_outbox(
      p_user_id => p_to_user_id,
      p_kind => 'nudge'::public.notification_kind,
      p_title => 'New nudge from your partner',
      p_body => case
        when p_kind = 'custom'::public.nudge_kind and v_message is not null then v_message
        else 'Your partner sent a nudge to keep momentum going.'
      end,
      p_url => '/social?tab=team',
      p_dedupe_key => 'nudge:' || v_nudge_id::text
    );
  end if;

  return v_nudge_id;
end;
$$;

create or replace function public.claim_notification_outbox_service(
  p_limit integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  kind public.notification_kind,
  title text,
  body text,
  url text,
  attempts smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.state = 'pending'::public.notification_state
      and outbox.available_at <= pg_catalog.now()
    order by outbox.available_at asc, outbox.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_outbox outbox
  set
    attempts = outbox.attempts + 1,
    available_at = pg_catalog.now() + interval '2 minutes'
  where outbox.id in (select candidates.id from candidates)
  returning
    outbox.id,
    outbox.user_id,
    outbox.kind,
    outbox.title,
    outbox.body,
    outbox.url,
    outbox.attempts;
end;
$$;

create or replace function public.resolve_notification_outbox_delivery_service(
  p_outbox_id uuid,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outbox_id is null then
    raise exception using errcode = '22023', message = 'outbox_id_required';
  end if;

  if p_sent then
    update public.notification_outbox outbox
    set
      state = 'sent'::public.notification_state,
      sent_at = pg_catalog.now(),
      last_error = null
    where outbox.id = p_outbox_id
      and outbox.state = 'pending'::public.notification_state;
    return found;
  end if;

  update public.notification_outbox outbox
  set
    state = case
      when outbox.attempts >= 5 then 'failed'::public.notification_state
      else 'pending'::public.notification_state
    end,
    last_error = nullif(pg_catalog.btrim(coalesce(p_error, '')), ''),
    available_at = case
      when outbox.attempts >= 5 then outbox.available_at
      else pg_catalog.now() + ((outbox.attempts + 1)::text || ' minutes')::interval
    end
  where outbox.id = p_outbox_id
    and outbox.state = 'pending'::public.notification_state;

  return found;
end;
$$;

create or replace function public.expire_pending_team_invites_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  update public.teams team
  set
    status = 'closed'::public.team_status,
    closed_at = pg_catalog.now()
  where team.status = 'pending'::public.team_status
    and team.invited_at < pg_catalog.now() - interval '14 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.accept_team_invite_service(
  p_team_id uuid,
  p_visibility_acknowledged boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_partner_id uuid;
  v_user_a_id uuid;
  v_user_b_id uuid;
  v_lock_first text;
  v_lock_second text;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_team_id is null then
    raise exception using errcode = '22023', message = 'team_id_required';
  end if;
  if coalesce(p_visibility_acknowledged, false) = false then
    raise exception using errcode = '22023', message = 'visibility_ack_required';
  end if;

  select
    team.user_a_id,
    team.user_b_id
  into
    v_user_a_id,
    v_user_b_id
  from public.teams team
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and v_uid in (team.user_a_id, team.user_b_id)
  for update;

  if not found then
    return false;
  end if;

  v_lock_first := least(v_user_a_id::text, v_user_b_id::text);
  v_lock_second := greatest(v_user_a_id::text, v_user_b_id::text);

  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team_user:' || v_lock_first)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team_user:' || v_lock_second)
  );

  update public.teams team
  set
    status = 'active'::public.team_status,
    accepted_at = pg_catalog.now(),
    closed_at = null,
    visibility_acknowledged_at = pg_catalog.now()
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and v_uid in (team.user_a_id, team.user_b_id)
    and not exists (
      select 1
      from public.teams active_team
      where active_team.id <> team.id
        and active_team.status = 'active'::public.team_status
        and (
          v_user_a_id in (active_team.user_a_id, active_team.user_b_id)
          or v_user_b_id in (active_team.user_a_id, active_team.user_b_id)
        )
    )
  returning case when team.user_a_id = v_uid then team.user_b_id else team.user_a_id end
  into v_partner_id;

  if not found then
    return false;
  end if;

  insert into public.team_preferences (team_id, user_id)
  values
    (p_team_id, v_uid),
    (p_team_id, v_partner_id)
  on conflict (team_id, user_id) do nothing;

  perform private.emit_feed_event(
    p_actor_id => v_uid,
    p_event_type => 'team_formed'::public.feed_event_type,
    p_subject_key => p_team_id::text,
    p_bucket_date => current_date,
    p_track_key => null,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object('teamId', p_team_id)
  );
  perform private.emit_feed_event(
    p_actor_id => v_partner_id,
    p_event_type => 'team_formed'::public.feed_event_type,
    p_subject_key => p_team_id::text,
    p_bucket_date => current_date,
    p_track_key => null,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object('teamId', p_team_id)
  );

  perform private.enqueue_notification_outbox(
    p_user_id => v_partner_id,
    p_kind => 'team_accepted'::public.notification_kind,
    p_title => 'Your team invite was accepted',
    p_body => 'You now have an active team partner.',
    p_url => '/social?tab=team',
    p_dedupe_key => 'team-accepted:' || p_team_id::text || ':' || v_partner_id::text
  );
  perform private.enqueue_notification_outbox(
    p_user_id => v_uid,
    p_kind => 'team_accepted'::public.notification_kind,
    p_title => 'Team connection confirmed',
    p_body => 'Your team partnership is now active.',
    p_url => '/social?tab=team',
    p_dedupe_key => 'team-accepted:' || p_team_id::text || ':' || v_uid::text
  );

  return true;
end;
$$;

create or replace function public.create_team_invite_service(
  p_partner_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_partner_id is null or p_partner_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_partner';
  end if;

  if exists (
    select 1 from public.teams team
    where team.status = 'active'
      and v_uid in (team.user_a_id, team.user_b_id)
  ) then
    raise exception using errcode = '23514', message = 'team_already_active';
  end if;
  if exists (
    select 1 from public.teams team
    where team.status = 'active'
      and p_partner_id in (team.user_a_id, team.user_b_id)
  ) then
    raise exception using errcode = '23514', message = 'partner_already_active';
  end if;

  v_a := least(v_uid, p_partner_id);
  v_b := greatest(v_uid, p_partner_id);

  insert into public.teams (
    user_a_id,
    user_b_id,
    initiator_id,
    status,
    invite_message
  )
  values (
    v_a,
    v_b,
    v_uid,
    'pending'::public.team_status,
    nullif(btrim(coalesce(p_message, '')), '')
  )
  on conflict (user_a_id, user_b_id)
  where status in ('pending', 'active')
  do nothing
  returning id into v_team_id;

  if v_team_id is null then
    select team.id
    into v_team_id
    from public.teams team
    where team.user_a_id = v_a
      and team.user_b_id = v_b
      and team.status in ('pending', 'active')
    order by team.invited_at desc
    limit 1;
  end if;

  perform private.enqueue_notification_outbox(
    p_user_id => p_partner_id,
    p_kind => 'team_invite'::public.notification_kind,
    p_title => 'New team invite',
    p_body => 'You have a pending team invite to review.',
    p_url => '/social?tab=team',
    p_dedupe_key => 'team-invite:' || v_team_id::text || ':' || p_partner_id::text
  );

  return v_team_id;
end;
$$;

create or replace function public.dissolve_team_service()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_partner_id uuid;
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  update public.teams team
  set
    status = 'closed'::public.team_status,
    closed_at = pg_catalog.now(),
    dissolved_at = pg_catalog.now()
  where team.status = 'active'::public.team_status
    and v_uid in (team.user_a_id, team.user_b_id)
  returning
    team.id,
    case when team.user_a_id = v_uid then team.user_b_id else team.user_a_id end
  into v_team_id, v_partner_id;

  if not found then
    return false;
  end if;

  perform private.enqueue_notification_outbox(
    p_user_id => v_partner_id,
    p_kind => 'team_dissolved'::public.notification_kind,
    p_title => 'Your team was dissolved',
    p_body => 'Team visibility and collaboration access were revoked.',
    p_url => '/social?tab=team',
    p_dedupe_key => 'team-dissolved:' || v_team_id::text || ':' || v_partner_id::text
  );

  return true;
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

  if p_scope = 'team' and to_regclass('public.teams') is not null then
    execute $team$
      select case
        when team.user_a_id = $1 then team.user_b_id
        else team.user_a_id
      end
      from public.teams team
      where team.status = 'active'
        and $1 in (team.user_a_id, team.user_b_id)
      order by team.accepted_at desc nulls last
      limit 1
    $team$
    into v_team_partner_id
    using v_uid;
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
    (
      select count(*)::integer
      from public.feed_reactions reaction
      where reaction.feed_event_id = event.id
    ) as reaction_count,
    exists (
      select 1
      from public.feed_reactions reaction
      where reaction.feed_event_id = event.id
        and reaction.user_id = v_uid
    ) as viewer_reacted,
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

alter table public.team_preferences enable row level security;
alter table public.nudges enable row level security;
alter table public.feed_reactions enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on table public.team_preferences from public, anon, authenticated;
revoke all on table public.nudges from public, anon, authenticated;
revoke all on table public.feed_reactions from public, anon, authenticated;
revoke all on table public.notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.team_preferences to service_role;
grant select, insert, update, delete on table public.nudges to service_role;
grant select, insert, update, delete on table public.feed_reactions to service_role;
grant select, insert, update, delete on table public.notification_outbox to service_role;

revoke all on function private.enqueue_notification_outbox(
  uuid,
  public.notification_kind,
  text,
  text,
  text,
  text,
  timestamptz
)
  from public, anon, authenticated;
revoke all on function private.partner_notifications_allowed(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.add_feed_reaction_service(uuid, public.reaction_kind)
  from public, anon;
grant execute on function public.add_feed_reaction_service(uuid, public.reaction_kind)
  to authenticated;

revoke all on function public.remove_feed_reaction_service(uuid, public.reaction_kind)
  from public, anon;
grant execute on function public.remove_feed_reaction_service(uuid, public.reaction_kind)
  to authenticated;

revoke all on function public.send_nudge_service(
  uuid,
  public.nudge_kind,
  uuid,
  text
)
  from public, anon;
grant execute on function public.send_nudge_service(
  uuid,
  public.nudge_kind,
  uuid,
  text
)
  to authenticated;

revoke all on function public.claim_notification_outbox_service(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_outbox_service(integer)
  to service_role;

revoke all on function public.resolve_notification_outbox_delivery_service(
  uuid,
  boolean,
  text
)
  from public, anon, authenticated;
grant execute on function public.resolve_notification_outbox_delivery_service(
  uuid,
  boolean,
  text
)
  to service_role;

revoke all on function public.expire_pending_team_invites_service()
  from public, anon, authenticated;
grant execute on function public.expire_pending_team_invites_service()
  to service_role;

do $cron$
begin
  begin
    perform cron.unschedule('expire-team-invites-daily');
  exception
    when others then null;
  end;
exception
  when others then null;
end;
$cron$;

do $http$
begin
  begin
    perform cron.unschedule('flush-notification-outbox-five-min');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'flush-notification-outbox-five-min',
    '*/5 * * * *',
    $job$
      with push_cron_secrets as (
        select
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'push_outbox_url'
          ) as outbox_url,
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'push_cron_secret'
          ) as cron_secret
      )
      select net.http_post(
        url := outbox_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || cron_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      )
      from push_cron_secrets
      where outbox_url is not null
        and cron_secret is not null;
    $job$
  );
exception
  when others then null;
end;
$http$;
