-- Duo contract: private.max_team_size() = 2. Raising it is not a one-line change.
-- Sites tagged DUO_CAP still assume exactly one other member (or one shared team).
-- teams.initiator_id and team_members.role = 'initiator' are dual-encoded and written
-- together in create_team_invite_service; do not update one without the other.

create or replace function private.team_partner_id(
  p_team_id uuid,
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  -- DUO_CAP(private.max_team_size): other member is unique at cap 2.
  -- order + limit 1 is arbitrary once a team has more than one other member.
  select member.user_id
  from public.team_members member
  where member.team_id = p_team_id
    and member.user_id <> p_user_id
  order by member.user_id
  limit 1;
$$;

create or replace function private.active_team_for_user(
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  -- One-active-team-per-user is enforced in invite/accept RPCs, not the schema.
  -- limit 1 is a silent pick if that invariant weakens. Pair-scoped callers
  -- should use private.team_id_for_pair instead.
  select team.id
  from public.team_members member
  join public.teams team on team.id = member.team_id
  where member.user_id = p_user_id
    and team.status = 'active'::public.team_status
  order by team.accepted_at desc nulls last
  limit 1;
$$;

create or replace function private.team_id_for_pair(
  p_user_a uuid,
  p_user_b uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_count integer;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return null;
  end if;

  select count(*)::integer, (array_agg(team.id))[1]
  into v_count, v_team_id
  from public.teams team
  where team.status = 'active'::public.team_status
    and exists (
      select 1
      from public.team_members member_a
      where member_a.team_id = team.id
        and member_a.user_id = p_user_a
    )
    and exists (
      select 1
      from public.team_members member_b
      where member_b.team_id = team.id
        and member_b.user_id = p_user_b
    );

  if coalesce(v_count, 0) > 1 then
    raise exception using errcode = '23514', message = 'ambiguous_active_team_pair';
  end if;

  return v_team_id;
end;
$$;

revoke all on function private.team_id_for_pair(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.get_team_state()
returns table (
  team_id uuid,
  status public.team_status,
  partner_id uuid,
  partner_username text,
  partner_display_name text,
  partner_avatar_url text,
  invite_message text,
  invited_at timestamptz,
  accepted_at timestamptz,
  closed_at timestamptz,
  is_incoming boolean
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

  -- DUO_CAP(private.max_team_size): partner_* is the other member (lowest user_id
  -- if the cap is ever raised). Aggregate so this stays one row per team.
  return query
  select
    team.id,
    team.status,
    (array_agg(partner.user_id order by partner.user_id))[1],
    (array_agg(partner_profile.username order by partner.user_id))[1],
    (array_agg(partner_profile.display_name order by partner.user_id))[1],
    (array_agg(partner_profile.avatar_url order by partner.user_id))[1],
    team.invite_message,
    team.invited_at,
    team.accepted_at,
    team.closed_at,
    team.initiator_id <> v_uid as is_incoming
  from public.teams team
  join public.team_members self_member
    on self_member.team_id = team.id
    and self_member.user_id = v_uid
  join public.team_members partner
    on partner.team_id = team.id
    and partner.user_id <> v_uid
  join public.profiles partner_profile
    on partner_profile.id = partner.user_id
  where team.status in ('pending'::public.team_status, 'active'::public.team_status)
  group by
    team.id,
    team.status,
    team.invite_message,
    team.invited_at,
    team.accepted_at,
    team.closed_at,
    team.initiator_id
  order by team.invited_at desc;
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
  v_member_id uuid;
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

  perform 1
  from public.teams team
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and exists (
      select 1
      from public.team_members member
      where member.team_id = team.id
        and member.user_id = v_uid
    )
  for update;

  if not found then
    return false;
  end if;

  for v_member_id in
    select member.user_id
    from public.team_members member
    where member.team_id = p_team_id
    order by member.user_id::text
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      private.xp_lock_key('resolution.social.team_user:' || v_member_id::text)
    );
  end loop;

  perform 1
  from public.team_members member
  where member.user_id in (
    select roster.user_id
    from public.team_members roster
    where roster.team_id = p_team_id
  )
  order by member.user_id, member.team_id
  for update;

  update public.teams team
  set
    status = 'active'::public.team_status,
    accepted_at = pg_catalog.now(),
    visibility_acknowledged_at = pg_catalog.now()
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and exists (
      select 1
      from public.team_members member
      where member.team_id = team.id
        and member.user_id = v_uid
    )
    and not exists (
      select 1
      from public.team_members active_member
      join public.teams active_team on active_team.id = active_member.team_id
      where active_team.id <> p_team_id
        and active_team.status = 'active'::public.team_status
        and active_member.user_id in (
          select roster.user_id
          from public.team_members roster
          where roster.team_id = p_team_id
        )
    );

  if not found then
    return false;
  end if;

  insert into public.team_preferences (team_id, user_id)
  select p_team_id, member.user_id
  from public.team_members member
  where member.team_id = p_team_id
  on conflict (team_id, user_id) do nothing;

  -- DUO_CAP(private.max_team_size): team_formed / accept notifications go to
  -- the accepting user and one other member, not the full roster.
  v_partner_id := private.team_partner_id(p_team_id, v_uid);

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
    and exists (
      select 1
      from public.team_members member
      where member.team_id = team.id
        and member.user_id = v_uid
    )
  returning team.id
  into v_team_id;

  if not found then
    return false;
  end if;

  -- DUO_CAP(private.max_team_size): notifies one other member, not the roster.
  v_partner_id := private.team_partner_id(v_team_id, v_uid);

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

  -- DUO_CAP(private.max_team_size): notifies the event actor only, via the
  -- unique shared active team (not "my" active team).
  if v_uid <> v_actor_id then
    v_team_id := private.team_id_for_pair(v_uid, v_actor_id);
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

  -- Resolve the shared active team; do not take "my" team then assume the pair.
  v_team_id := private.team_id_for_pair(v_uid, p_to_user_id);
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
  v_cohort_id uuid := null;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_scope not in ('global', 'actor', 'team', 'cohort') then
    raise exception using errcode = '22023', message = 'invalid_feed_scope';
  end if;

  if p_scope = 'team' then
    -- DUO_CAP(private.max_team_size): team feed is self + one partner.
    v_team_partner_id := private.team_partner_id(
      private.active_team_for_user(v_uid),
      v_uid
    );
  end if;

  if p_scope = 'cohort' then
    if p_scope_id is null then
      raise exception using errcode = '22023', message = 'cohort_scope_required';
    end if;
    if not private.viewer_in_cohort(v_uid, p_scope_id) then
      raise exception using errcode = '42501', message = 'cohort_membership_required';
    end if;
    v_cohort_id := p_scope_id;
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
  join public.profiles actor on actor.id = event.actor_id
  left join public.goals goal on goal.id = event.goal_id
  left join public.goal_categories category on category.key = event.track_key
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
      or (
        p_scope = 'cohort'
        and v_cohort_id is not null
        and private.viewer_in_cohort(event.actor_id, v_cohort_id)
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
