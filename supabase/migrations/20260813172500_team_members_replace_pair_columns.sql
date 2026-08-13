-- Replace teams.user_a_id / user_b_id with team_members.
-- Duo stays a cap of 2 plus one active team per user; helper signatures stay.

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default pg_catalog.now(),
  primary key (team_id, user_id),
  constraint team_members_role_check check (role in ('member', 'initiator'))
);

create index if not exists team_members_user_id_idx
  on public.team_members (user_id);

insert into public.team_members (team_id, user_id, role, joined_at)
select
  team.id,
  team.user_a_id,
  case
    when team.user_a_id = team.initiator_id then 'initiator'
    else 'member'
  end,
  team.created_at
from public.teams team
union all
select
  team.id,
  team.user_b_id,
  case
    when team.user_b_id = team.initiator_id then 'initiator'
    else 'member'
  end,
  team.created_at
from public.teams team
on conflict (team_id, user_id) do nothing;

create or replace function private.max_team_size()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2;
$$;

create or replace function private.assert_team_member_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.team_members member
    where member.team_id = new.team_id
  ) >= private.max_team_size() then
    raise exception using errcode = '23514', message = 'team_member_cap_exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_assert_cap on public.team_members;
create trigger team_members_assert_cap
before insert on public.team_members
for each row
execute function private.assert_team_member_cap();

create or replace function private.team_partner_id(
  p_team_id uuid,
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select member.user_id
  from public.team_members member
  where member.team_id = p_team_id
    and member.user_id <> p_user_id
  order by member.user_id
  limit 1;
$$;

create or replace function private.team_display_name(p_team_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(
    coalesce(profile.display_name, profile.username, 'Unknown'),
    ' + ' order by member.user_id
  )
  from public.team_members member
  join public.profiles profile on profile.id = member.user_id
  where member.team_id = p_team_id;
$$;

create or replace function private.team_all_members_socially_visible(p_team_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.team_members member
      where member.team_id = p_team_id
    )
    and not exists (
      select 1
      from public.team_members member
      join public.profiles profile on profile.id = member.user_id
      where member.team_id = p_team_id
        and coalesce(profile.social_activity_visible, false) = false
    );
$$;

create or replace function private.is_active_team_pair(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.team_members member_a
      join public.team_members member_b
        on member_b.team_id = member_a.team_id
        and member_b.user_id = p_user_b
      join public.teams team
        on team.id = member_a.team_id
      where member_a.user_id = p_user_a
        and team.status = 'active'::public.team_status
    );
$$;

create or replace function private.active_team_for_user(
  p_user_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select team.id
  from public.team_members member
  join public.teams team on team.id = member.team_id
  where member.user_id = p_user_id
    and team.status = 'active'::public.team_status
  order by team.accepted_at desc nulls last
  limit 1;
$$;

create or replace function private.subject_member_ids(
  p_subject_kind public.social_subject_kind,
  p_subject_id uuid
)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_ids uuid[];
begin
  if p_subject_kind = 'user'::public.social_subject_kind then
    return array[p_subject_id]::uuid[];
  end if;

  if p_subject_kind = 'team'::public.social_subject_kind then
    select coalesce(array_agg(member.user_id order by member.user_id), '{}'::uuid[])
    into v_user_ids
    from public.team_members member
    join public.teams team on team.id = member.team_id
    where team.id = p_subject_id
      and team.status = 'active'::public.team_status;

    return coalesce(v_user_ids, '{}'::uuid[]);
  end if;

  raise exception using errcode = '22023', message = 'invalid_subject_kind';
end;
$$;

create or replace function private.team_in_cohort(
  p_team_id uuid,
  p_cohort_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams team
    where team.id = p_team_id
      and team.status = 'active'::public.team_status
      and exists (
        select 1
        from public.team_members member
        where member.team_id = team.id
      )
      and not exists (
        select 1
        from public.team_members member
        where member.team_id = team.id
          and not exists (
            select 1
            from public.cohort_members cohort_member
            where cohort_member.cohort_id = p_cohort_id
              and cohort_member.user_id = member.user_id
          )
      )
  );
$$;

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

  return query
  select
    team.id,
    team.status,
    partner.user_id,
    partner_profile.username,
    partner_profile.display_name,
    partner_profile.avatar_url,
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
  order by team.invited_at desc;
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
  v_lock_first text;
  v_lock_second text;
  v_team_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_partner_id is null or p_partner_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_partner';
  end if;

  v_lock_first := least(v_uid::text, p_partner_id::text);
  v_lock_second := greatest(v_uid::text, p_partner_id::text);
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team_user:' || v_lock_first)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.team_user:' || v_lock_second)
  );

  if exists (
    select 1
    from public.team_members member
    join public.teams team on team.id = member.team_id
    where member.user_id = v_uid
      and team.status = 'active'::public.team_status
  ) then
    raise exception using errcode = '23514', message = 'team_already_active';
  end if;
  if exists (
    select 1
    from public.team_members member
    join public.teams team on team.id = member.team_id
    where member.user_id = p_partner_id
      and team.status = 'active'::public.team_status
  ) then
    raise exception using errcode = '23514', message = 'partner_already_active';
  end if;

  select team.id
  into v_team_id
  from public.teams team
  where team.status in ('pending'::public.team_status, 'active'::public.team_status)
    and exists (
      select 1
      from public.team_members member
      where member.team_id = team.id
        and member.user_id = v_uid
    )
    and exists (
      select 1
      from public.team_members member
      where member.team_id = team.id
        and member.user_id = p_partner_id
    )
  order by team.invited_at desc
  limit 1
  for update;

  if v_team_id is null then
    insert into public.teams (
      initiator_id,
      status,
      invite_message
    )
    values (
      v_uid,
      'pending'::public.team_status,
      nullif(btrim(coalesce(p_message, '')), '')
    )
    returning id into v_team_id;

    insert into public.team_members (team_id, user_id, role)
    values
      (v_team_id, v_uid, 'initiator'),
      (v_team_id, p_partner_id, 'member');
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

  v_partner_id := private.team_partner_id(p_team_id, v_uid);

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

create or replace function public.decline_team_invite_service(
  p_team_id uuid
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
  if p_team_id is null then
    raise exception using errcode = '22023', message = 'team_id_required';
  end if;

  update public.teams team
  set
    status = 'closed'::public.team_status,
    closed_at = pg_catalog.now()
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and exists (
      select 1
      from public.team_members member
      where member.team_id = team.id
        and member.user_id = v_uid
    );

  return found;
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

  if v_uid <> v_actor_id and private.is_active_team_pair(v_uid, v_actor_id) then
    v_team_id := private.active_team_for_user(v_uid);
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

  if not private.is_active_team_pair(v_uid, p_to_user_id) then
    raise exception using errcode = '22023', message = 'team_required';
  end if;
  v_team_id := private.active_team_for_user(v_uid);

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

create or replace function public.refresh_leaderboard_standings_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_rows integer := 0;
  v_inserted integer := 0;
  v_from date;
  v_to date;
  r_season public.leaderboard_seasons%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.leaderboard_refresh')
  );

  update public.leaderboard_seasons season
  set
    status = 'open'::public.leaderboard_season_status,
    updated_at = v_now
  where season.status = 'upcoming'::public.leaderboard_season_status
    and season.starts_at <= v_now
    and (season.ends_at is null or season.ends_at > v_now);

  for r_season in
    select season.*
    from public.leaderboard_seasons season
    where season.status = 'open'::public.leaderboard_season_status
  loop
    v_from := (r_season.starts_at at time zone 'UTC')::date;
    v_to := (
      case
        when r_season.ends_at is null then v_now
        else least(r_season.ends_at, v_now)
      end at time zone 'UTC'
    )::date;

    delete from public.leaderboard_standings standing
    where standing.season_id = r_season.id;

    v_inserted := 0;

    if r_season.subject_kind = 'user'::public.social_subject_kind then
      insert into public.leaderboard_standings (
        season_id, subject_kind, subject_id, score, tie_break_at, rank, refreshed_at
      )
      select
        r_season.id,
        'user'::public.social_subject_kind,
        ranked.subject_id,
        ranked.score,
        ranked.tie_break_at,
        ranked.rank,
        v_now
      from (
        select
          scored.subject_id,
          scored.score,
          scored.tie_break_at,
          dense_rank() over (
            order by scored.score desc, scored.tie_break_at asc nulls last, scored.subject_id asc
          )::integer as rank
        from (
          select
            profile.id as subject_id,
            private.challenge_progress_value(
              r_season.metric,
              r_season.metric_track_key,
              array[profile.id]::uuid[],
              v_from,
              v_to
            ) as score,
            (
              select min(ledger.created_at)
              from public.xp_ledger ledger
              where ledger.user_id = profile.id
                and ledger.earned_on between v_from and v_to
                and (
                  (r_season.metric in ('total_xp', 'category_xp') and ledger.event_type in ('completion_credit', 'goal_achievement'))
                  or (
                    r_season.metric in ('completions_count', 'distinct_active_days', 'max_streak_days')
                    and ledger.event_type = 'completion_credit'
                    and ledger.xp_delta > 0
                  )
                )
                and (r_season.metric <> 'category_xp' or ledger.track_key = r_season.metric_track_key)
            ) as tie_break_at
          from public.profiles profile
          where exists (
              select 1
              from public.xp_ledger ledger
              where ledger.user_id = profile.id
                and ledger.earned_on between v_from and v_to
            )
            and profile.social_activity_visible = true
            and (
              r_season.scope = 'global'::public.leaderboard_scope_kind
              or (
                r_season.scope = 'cohort'::public.leaderboard_scope_kind
                and private.viewer_in_cohort(profile.id, r_season.cohort_id)
              )
            )
        ) scored
      ) ranked;
      get diagnostics v_inserted = row_count;
    elsif r_season.subject_kind = 'team'::public.social_subject_kind then
      insert into public.leaderboard_standings (
        season_id, subject_kind, subject_id, score, tie_break_at, rank, refreshed_at
      )
      select
        r_season.id,
        'team'::public.social_subject_kind,
        ranked.subject_id,
        ranked.score,
        ranked.tie_break_at,
        ranked.rank,
        v_now
      from (
        select
          scored.subject_id,
          scored.score,
          scored.tie_break_at,
          dense_rank() over (
            order by scored.score desc, scored.tie_break_at asc nulls last, scored.subject_id asc
          )::integer as rank
        from (
          select
            team.id as subject_id,
            private.challenge_progress_value(
              r_season.metric,
              r_season.metric_track_key,
              members.member_ids,
              v_from,
              v_to
            ) as score,
            (
              select min(ledger.created_at)
              from public.xp_ledger ledger
              where ledger.user_id = any(members.member_ids)
                and ledger.earned_on between v_from and v_to
                and (
                  (r_season.metric in ('total_xp', 'category_xp') and ledger.event_type in ('completion_credit', 'goal_achievement'))
                  or (
                    r_season.metric in ('completions_count', 'distinct_active_days', 'max_streak_days')
                    and ledger.event_type = 'completion_credit'
                    and ledger.xp_delta > 0
                  )
                )
                and (r_season.metric <> 'category_xp' or ledger.track_key = r_season.metric_track_key)
            ) as tie_break_at
          from public.teams team
          join lateral (
            select coalesce(array_agg(member.user_id), '{}'::uuid[]) as member_ids
            from public.team_members member
            where member.team_id = team.id
          ) members on true
          where team.status = 'active'::public.team_status
            and private.team_all_members_socially_visible(team.id)
            and exists (
              select 1
              from public.xp_ledger ledger
              where ledger.user_id = any(members.member_ids)
                and ledger.earned_on between v_from and v_to
            )
            and (
              r_season.scope = 'global'::public.leaderboard_scope_kind
              or (
                r_season.scope = 'cohort'::public.leaderboard_scope_kind
                and private.team_in_cohort(team.id, r_season.cohort_id)
              )
            )
        ) scored
      ) ranked;
      get diagnostics v_inserted = row_count;
    end if;

    v_rows := v_rows + v_inserted;

    if r_season.ends_at is not null and r_season.ends_at <= v_now then
      update public.leaderboard_seasons season
      set
        status = 'closed'::public.leaderboard_season_status,
        updated_at = v_now
      where season.id = r_season.id
        and season.status = 'open'::public.leaderboard_season_status;
    end if;
  end loop;

  return v_rows;
end;
$$;

create or replace function public.rollover_leaderboard_seasons_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_count integer := 0;
  v_next_id uuid;
  v_next_slug text;
  v_newly_frozen_seasons uuid[] := '{}'::uuid[];
  r_season public.leaderboard_seasons%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    private.xp_lock_key('resolution.social.leaderboard_rollover')
  );

  perform public.refresh_leaderboard_standings_service();

  for r_season in
    select season.*
    from public.leaderboard_seasons season
    where season.status = 'closed'::public.leaderboard_season_status
      and season.ends_at is not null
      and season.rollover <> 'none'::public.leaderboard_rollover
      and season.ends_at <= v_now
      and not exists (
        select 1
        from public.leaderboard_seasons child
        where child.previous_season_id = season.id
      )
  loop
    v_next_slug := r_season.slug || '-' || to_char(r_season.ends_at, 'YYYYMMDD');

    insert into public.leaderboard_seasons (
      slug,
      title,
      subject_kind,
      metric,
      metric_track_key,
      scope,
      cohort_id,
      starts_at,
      ends_at,
      status,
      rollover,
      previous_season_id,
      created_by
    )
    values (
      v_next_slug,
      r_season.title,
      r_season.subject_kind,
      r_season.metric,
      r_season.metric_track_key,
      r_season.scope,
      r_season.cohort_id,
      r_season.ends_at,
      private.next_rollover_end(r_season.rollover, r_season.ends_at),
      'open'::public.leaderboard_season_status,
      r_season.rollover,
      r_season.id,
      r_season.created_by
    )
    on conflict (slug) do nothing
    returning id into v_next_id;

    if v_next_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  with inserted as (
    insert into public.leaderboard_season_results (
      season_id, subject_kind, subject_id, score, tie_break_at, rank, display_name
    )
    select
      standing.season_id,
      standing.subject_kind,
      standing.subject_id,
      standing.score,
      standing.tie_break_at,
      standing.rank,
      case
        when standing.subject_kind = 'team'::public.social_subject_kind then
          private.team_display_name(standing.subject_id)
        else
          coalesce(profile.display_name, profile.username, 'Unknown')
      end
    from public.leaderboard_standings standing
    join public.leaderboard_seasons season on season.id = standing.season_id
    left join public.profiles profile
      on standing.subject_kind = 'user'::public.social_subject_kind
      and profile.id = standing.subject_id
    where season.status = 'closed'::public.leaderboard_season_status
      and not exists (
        select 1
        from public.leaderboard_season_results existing
        where existing.season_id = standing.season_id
      )
    on conflict (season_id, subject_kind, subject_id) do nothing
    returning season_id
  )
  select coalesce(array_agg(distinct inserted.season_id), '{}'::uuid[])
  into v_newly_frozen_seasons
  from inserted;

  perform private.emit_feed_event(
    p_actor_id => result.subject_id,
    p_event_type => 'season_result'::public.feed_event_type,
    p_subject_key => result.season_id::text,
    p_bucket_date => current_date,
    p_track_key => season.metric_track_key,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object(
      'seasonId', result.season_id,
      'rank', result.rank,
      'score', result.score
    )
  )
  from public.leaderboard_season_results result
  join public.leaderboard_seasons season
    on season.id = result.season_id
  where result.season_id = any(v_newly_frozen_seasons)
    and result.subject_kind = 'user'::public.social_subject_kind
    and result.rank <= 3;

  perform private.emit_feed_event(
    p_actor_id => member.user_id,
    p_event_type => 'season_result'::public.feed_event_type,
    p_subject_key => result.season_id::text || ':team:' || result.subject_id::text,
    p_bucket_date => current_date,
    p_track_key => season.metric_track_key,
    p_goal_id => null,
    p_xp_delta => 0,
    p_occurrence_delta => 1,
    p_payload => jsonb_build_object(
      'seasonId', result.season_id,
      'rank', result.rank,
      'score', result.score,
      'teamId', result.subject_id
    )
  )
  from public.leaderboard_season_results result
  join public.leaderboard_seasons season
    on season.id = result.season_id
  join public.team_members member
    on member.team_id = result.subject_id
  where result.season_id = any(v_newly_frozen_seasons)
    and result.subject_kind = 'team'::public.social_subject_kind
    and result.rank <= 3;

  return v_count;
end;
$$;

create or replace function public.get_leaderboard_standings(
  p_season_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  season_id uuid,
  subject_kind public.social_subject_kind,
  subject_id uuid,
  display_name text,
  score numeric,
  rank integer,
  tie_break_at timestamptz,
  viewer_rank integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_subject_kind public.social_subject_kind;
  v_status public.leaderboard_season_status;
  v_scope public.leaderboard_scope_kind;
  v_cohort_id uuid;
  v_viewer_subject_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_season_id is null then
    raise exception using errcode = '22023', message = 'season_id_required';
  end if;

  select season.subject_kind, season.status, season.scope, season.cohort_id
  into v_subject_kind, v_status, v_scope, v_cohort_id
  from public.leaderboard_seasons season
  where season.id = p_season_id;
  if not found then
    raise exception using errcode = '22023', message = 'season_not_found';
  end if;

  if v_scope = 'cohort'::public.leaderboard_scope_kind
    and not private.viewer_in_cohort(v_uid, v_cohort_id) then
    raise exception using errcode = '42501', message = 'cohort_membership_required';
  end if;

  if v_subject_kind = 'user'::public.social_subject_kind then
    v_viewer_subject_id := v_uid;
  else
    v_viewer_subject_id := private.active_team_for_user(v_uid);
  end if;

  if v_status = 'closed'::public.leaderboard_season_status then
    return query
    with viewer as (
      select result.rank
      from public.leaderboard_season_results result
      where result.season_id = p_season_id
        and result.subject_kind = v_subject_kind
        and result.subject_id = v_viewer_subject_id
    )
    select
      result.season_id,
      result.subject_kind,
      result.subject_id,
      result.display_name,
      result.score,
      result.rank,
      result.tie_break_at,
      (select viewer.rank from viewer) as viewer_rank
    from public.leaderboard_season_results result
    where result.season_id = p_season_id
    order by result.rank asc
    limit v_limit
    offset v_offset;
    return;
  end if;

  return query
  with viewer as (
    select standing.rank
    from public.leaderboard_standings standing
    where standing.season_id = p_season_id
      and standing.subject_kind = v_subject_kind
      and standing.subject_id = v_viewer_subject_id
  )
  select
    standing.season_id,
    standing.subject_kind,
    standing.subject_id,
    case
      when standing.subject_kind = 'team'::public.social_subject_kind then
        private.team_display_name(standing.subject_id)
      else
        coalesce(profile.display_name, profile.username, 'Unknown')
    end as display_name,
    standing.score,
    standing.rank,
    standing.tie_break_at,
    (select viewer.rank from viewer) as viewer_rank
  from public.leaderboard_standings standing
  left join public.profiles profile
    on standing.subject_kind = 'user'::public.social_subject_kind
    and profile.id = standing.subject_id
  where standing.season_id = p_season_id
    and (
      (
        standing.subject_kind = 'user'::public.social_subject_kind
        and coalesce(profile.social_activity_visible, false) = true
      )
      or (
        standing.subject_kind = 'team'::public.social_subject_kind
        and private.team_all_members_socially_visible(standing.subject_id)
      )
    )
  order by standing.rank asc
  limit v_limit
  offset v_offset;
end;
$$;

drop index if exists public.teams_pending_or_active_pair_idx;
drop index if exists public.teams_user_a_idx;
drop index if exists public.teams_user_b_idx;

alter table public.teams drop constraint if exists teams_distinct_users;
alter table public.teams drop constraint if exists teams_canonical_pair;
alter table public.teams drop constraint if exists teams_initiator_in_pair;
alter table public.teams drop column if exists user_a_id;
alter table public.teams drop column if exists user_b_id;

alter table public.team_members enable row level security;
revoke all on table public.team_members from public, anon, authenticated;
grant select, insert, update, delete on table public.team_members to service_role;

revoke all on function private.max_team_size()
  from public, anon, authenticated;
revoke all on function private.assert_team_member_cap()
  from public, anon, authenticated;
revoke all on function private.team_partner_id(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.team_display_name(uuid)
  from public, anon, authenticated;
revoke all on function private.team_all_members_socially_visible(uuid)
  from public, anon, authenticated;
revoke all on function private.is_active_team_pair(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.active_team_for_user(uuid)
  from public, anon, authenticated;
revoke all on function private.subject_member_ids(public.social_subject_kind, uuid)
  from public, anon, authenticated;
revoke all on function private.team_in_cohort(uuid, uuid)
  from public, anon, authenticated;
