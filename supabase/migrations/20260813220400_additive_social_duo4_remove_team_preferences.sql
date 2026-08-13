-- Social Duo 4:
-- Remove the dormant team_preferences surface.
--
-- share_completions / allow_nudges / notify_partner_activity were never
-- writable: no API route, no RPC, no UI. A team is total mutual visibility,
-- so there is no preference left to express.
--
-- Function bodies below are sourced from
-- 20260813205156_team_duo_contract_hardening.sql (the members-table versions)
-- with only the team_preferences reads removed:
--   * accept_team_invite_service  - drops the preference-seeding insert
--   * add_feed_reaction_service   - notifies whenever a shared active team exists
--   * send_nudge_service          - drops the allow_nudges gate and notifies
--                                   unconditionally
--
-- Dropping allow_nudges is a behavior change, not dead-code removal: its check
-- was fail-closed on a missing row, so any team not created through
-- accept_team_invite_service could never receive a nudge. Nudges stay bounded
-- by the existing 5/24h and 1-per-goal-per-day limits plus the team_required
-- gate.

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
    if v_team_id is not null then
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

  return v_nudge_id;
end;
$$;

drop function if exists private.partner_notifications_allowed(uuid, uuid);

drop table if exists public.team_preferences;
