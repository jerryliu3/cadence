-- Social Phase 7:
-- Duo nudges, feed reactions, and durable notification outbox.

do $$
begin
  if exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'duo_status'
  ) and not exists (
    select 1
    from pg_enum enum_value
    where enum_value.enumtypid = 'public.duo_status'::regtype
      and enum_value.enumlabel = 'expired'
  ) then
    alter type public.duo_status add value 'expired';
  end if;

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
      'duo_invite',
      'duo_accepted',
      'duo_dissolved',
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

create table if not exists public.duo_preferences (
  duo_id uuid not null references public.duos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_completions boolean not null default true,
  allow_nudges boolean not null default true,
  notify_partner_activity boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (duo_id, user_id)
);

alter table public.duo_preferences
add column if not exists share_completions boolean not null default true;
alter table public.duo_preferences
add column if not exists allow_nudges boolean not null default true;
alter table public.duo_preferences
add column if not exists notify_partner_activity boolean not null default true;

insert into public.duo_preferences (duo_id, user_id)
select duo.id, duo.user_a_id
from public.duos duo
where duo.status = 'active'::public.duo_status
on conflict (duo_id, user_id) do nothing;

insert into public.duo_preferences (duo_id, user_id)
select duo.id, duo.user_b_id
from public.duos duo
where duo.status = 'active'::public.duo_status
on conflict (duo_id, user_id) do nothing;

drop trigger if exists set_duo_preferences_updated_at on public.duo_preferences;
create trigger set_duo_preferences_updated_at
before update on public.duo_preferences
for each row execute function public.set_updated_at();

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.duos(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.nudge_kind not null default 'cheer',
  goal_id uuid references public.goals(id) on delete set null,
  message text,
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
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

create or replace function private.sync_feed_reaction_count()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_feed_event_id uuid := coalesce(new.feed_event_id, old.feed_event_id);
begin
  update public.feed_events event
  set
    reaction_count = (
      select count(*)::integer
      from public.feed_reactions reaction
      where reaction.feed_event_id = v_feed_event_id
    ),
    updated_at = pg_catalog.now()
  where event.id = v_feed_event_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_feed_reaction_count_after_insert
on public.feed_reactions;
create trigger sync_feed_reaction_count_after_insert
after insert on public.feed_reactions
for each row
execute function private.sync_feed_reaction_count();

drop trigger if exists sync_feed_reaction_count_after_delete
on public.feed_reactions;
create trigger sync_feed_reaction_count_after_delete
after delete on public.feed_reactions
for each row
execute function private.sync_feed_reaction_count();

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
  p_duo_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select pref.notify_partner_activity
    from public.duo_preferences pref
    where pref.duo_id = p_duo_id
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
  v_duo_id uuid;
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
    select duo.id
    into v_duo_id
    from public.duos duo
    where duo.status = 'active'::public.duo_status
      and (
        (duo.user_a_id = v_uid and duo.user_b_id = v_actor_id)
        or (duo.user_a_id = v_actor_id and duo.user_b_id = v_uid)
      )
    limit 1;

    if v_duo_id is not null and private.partner_notifications_allowed(v_duo_id, v_actor_id) then
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
  v_duo_id uuid;
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_nudge_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_to_user_id is null or p_to_user_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_nudge_target';
  end if;

  select duo.id
  into v_duo_id
  from public.duos duo
  where duo.status = 'active'::public.duo_status
    and (
      (duo.user_a_id = v_uid and duo.user_b_id = p_to_user_id)
      or (duo.user_a_id = p_to_user_id and duo.user_b_id = v_uid)
    )
  limit 1;

  if v_duo_id is null then
    raise exception using errcode = '22023', message = 'duo_required';
  end if;

  if not exists (
    select 1
    from public.duo_preferences pref
    where pref.duo_id = v_duo_id
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
    duo_id,
    from_user_id,
    to_user_id,
    kind,
    goal_id,
    message
  )
  values (
    v_duo_id,
    v_uid,
    p_to_user_id,
    p_kind,
    p_goal_id,
    v_message
  )
  returning id into v_nudge_id;

  if private.partner_notifications_allowed(v_duo_id, p_to_user_id) then
    perform private.enqueue_notification_outbox(
      p_user_id => p_to_user_id,
      p_kind => 'nudge'::public.notification_kind,
      p_title => 'New nudge from your partner',
      p_body => case
        when p_kind = 'custom'::public.nudge_kind and v_message is not null then v_message
        else 'Your partner sent a nudge to keep momentum going.'
      end,
      p_url => '/social?tab=duo',
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

create or replace function public.expire_pending_duo_invites_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  update public.duos duo
  set
    status = 'expired'::public.duo_status,
    responded_at = pg_catalog.now()
  where duo.status = 'pending'::public.duo_status
    and duo.invited_at < pg_catalog.now() - interval '14 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.accept_duo_invite_service(
  p_duo_id uuid,
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
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_duo_id is null then
    raise exception using errcode = '22023', message = 'duo_id_required';
  end if;
  if coalesce(p_visibility_acknowledged, false) = false then
    raise exception using errcode = '22023', message = 'visibility_ack_required';
  end if;

  update public.duos duo
  set
    status = 'active'::public.duo_status,
    accepted_at = pg_catalog.now(),
    responded_at = pg_catalog.now(),
    visibility_acknowledged_at = pg_catalog.now()
  where duo.id = p_duo_id
    and duo.status = 'pending'::public.duo_status
    and duo.initiator_id <> v_uid
    and v_uid in (duo.user_a_id, duo.user_b_id)
  returning case when duo.user_a_id = v_uid then duo.user_b_id else duo.user_a_id end
  into v_partner_id;

  if not found then
    return false;
  end if;

  insert into public.duo_preferences (duo_id, user_id)
  values
    (p_duo_id, v_uid),
    (p_duo_id, v_partner_id)
  on conflict (duo_id, user_id) do nothing;

  perform private.emit_feed_event(
    p_actor_id => v_uid,
    p_event_type => 'duo_formed'::public.feed_event_type,
    p_subject_key => p_duo_id::text,
    p_bucket_date => current_date,
    p_track_key => null,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object('duoId', p_duo_id)
  );
  perform private.emit_feed_event(
    p_actor_id => v_partner_id,
    p_event_type => 'duo_formed'::public.feed_event_type,
    p_subject_key => p_duo_id::text,
    p_bucket_date => current_date,
    p_track_key => null,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object('duoId', p_duo_id)
  );

  perform private.enqueue_notification_outbox(
    p_user_id => v_partner_id,
    p_kind => 'duo_accepted'::public.notification_kind,
    p_title => 'Your duo invite was accepted',
    p_body => 'You now have an active duo partner.',
    p_url => '/social?tab=duo',
    p_dedupe_key => 'duo-accepted:' || p_duo_id::text || ':' || v_partner_id::text
  );
  perform private.enqueue_notification_outbox(
    p_user_id => v_uid,
    p_kind => 'duo_accepted'::public.notification_kind,
    p_title => 'Duo connection confirmed',
    p_body => 'Your duo partnership is now active.',
    p_url => '/social?tab=duo',
    p_dedupe_key => 'duo-accepted:' || p_duo_id::text || ':' || v_uid::text
  );

  return true;
end;
$$;

create or replace function public.create_duo_invite_service(
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
  v_duo_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_partner_id is null or p_partner_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_partner';
  end if;

  if exists (
    select 1 from public.duos duo
    where duo.status = 'active'
      and v_uid in (duo.user_a_id, duo.user_b_id)
  ) then
    raise exception using errcode = '23514', message = 'duo_already_active';
  end if;
  if exists (
    select 1 from public.duos duo
    where duo.status = 'active'
      and p_partner_id in (duo.user_a_id, duo.user_b_id)
  ) then
    raise exception using errcode = '23514', message = 'partner_already_active';
  end if;

  v_a := least(v_uid, p_partner_id);
  v_b := greatest(v_uid, p_partner_id);

  insert into public.duos (
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
    'pending'::public.duo_status,
    nullif(btrim(coalesce(p_message, '')), '')
  )
  on conflict (user_a_id, user_b_id)
  where status in ('pending', 'active')
  do nothing
  returning id into v_duo_id;

  if v_duo_id is null then
    select duo.id
    into v_duo_id
    from public.duos duo
    where duo.user_a_id = v_a
      and duo.user_b_id = v_b
      and duo.status in ('pending', 'active')
    order by duo.invited_at desc
    limit 1;
  end if;

  perform private.enqueue_notification_outbox(
    p_user_id => p_partner_id,
    p_kind => 'duo_invite'::public.notification_kind,
    p_title => 'New duo invite',
    p_body => 'You have a pending duo invite to review.',
    p_url => '/social?tab=duo',
    p_dedupe_key => 'duo-invite:' || v_duo_id::text || ':' || p_partner_id::text
  );

  return v_duo_id;
end;
$$;

create or replace function public.dissolve_duo_service()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_partner_id uuid;
  v_duo_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  update public.duos duo
  set
    status = 'dissolved'::public.duo_status,
    dissolved_at = pg_catalog.now(),
    responded_at = pg_catalog.now()
  where duo.status = 'active'::public.duo_status
    and v_uid in (duo.user_a_id, duo.user_b_id)
  returning
    duo.id,
    case when duo.user_a_id = v_uid then duo.user_b_id else duo.user_a_id end
  into v_duo_id, v_partner_id;

  if not found then
    return false;
  end if;

  perform private.enqueue_notification_outbox(
    p_user_id => v_partner_id,
    p_kind => 'duo_dissolved'::public.notification_kind,
    p_title => 'Your duo was dissolved',
    p_body => 'Duo visibility and collaboration access were revoked.',
    p_url => '/social?tab=duo',
    p_dedupe_key => 'duo-dissolved:' || v_duo_id::text || ':' || v_partner_id::text
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
  v_duo_partner_id uuid := null;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_scope not in ('global', 'actor', 'duo') then
    raise exception using errcode = '22023', message = 'invalid_feed_scope';
  end if;

  if p_scope = 'duo' and to_regclass('public.duos') is not null then
    execute $duo$
      select case
        when duo.user_a_id = $1 then duo.user_b_id
        else duo.user_a_id
      end
      from public.duos duo
      where duo.status = 'active'
        and $1 in (duo.user_a_id, duo.user_b_id)
      order by duo.accepted_at desc nulls last
      limit 1
    $duo$
    into v_duo_partner_id
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
        and goal.feed_visibility = 'title_public'::public.goal_feed_visibility
        and goal.is_deleted = false
        and goal.archived_at is null
      then goal.title
      else null
    end as goal_title,
    event.xp_delta,
    event.occurrence_count,
    event.reaction_count,
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
        p_scope = 'duo'
        and v_duo_partner_id is not null
        and event.actor_id in (v_uid, v_duo_partner_id)
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

alter table public.duo_preferences enable row level security;
alter table public.nudges enable row level security;
alter table public.feed_reactions enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on table public.duo_preferences from public, anon, authenticated;
revoke all on table public.nudges from public, anon, authenticated;
revoke all on table public.feed_reactions from public, anon, authenticated;
revoke all on table public.notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.duo_preferences to service_role;
grant select, insert, update, delete on table public.nudges to service_role;
grant select, insert, update, delete on table public.feed_reactions to service_role;
grant select, insert, update, delete on table public.notification_outbox to service_role;

revoke all on function private.sync_feed_reaction_count()
  from public, anon, authenticated;
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

revoke all on function public.expire_pending_duo_invites_service()
  from public, anon, authenticated;
grant execute on function public.expire_pending_duo_invites_service()
  to service_role;

do $cron$
begin
  begin
    perform cron.unschedule('expire-duo-invites-daily');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'expire-duo-invites-daily',
    '22 4 * * *',
    $job$select public.expire_pending_duo_invites_service()$job$
  );
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
