-- Social Phase 6:
-- Team lifecycle and partner visibility projection.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'team_status'
  ) then
    create type public.team_status as enum (
      'pending',
      'active',
      'declined',
      'cancelled',
      'dissolved'
    );
  end if;
end;
$$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  status public.team_status not null default 'pending',
  invite_message text,
  visibility_acknowledged_at timestamptz,
  invited_at timestamptz not null default pg_catalog.now(),
  accepted_at timestamptz,
  responded_at timestamptz,
  dissolved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint teams_distinct_users check (user_a_id <> user_b_id),
  constraint teams_canonical_pair check (user_a_id < user_b_id),
  constraint teams_initiator_in_pair check (initiator_id in (user_a_id, user_b_id)),
  constraint teams_message_length check (
    invite_message is null or pg_catalog.length(invite_message) <= 400
  ),
  constraint teams_accept_fields check (
    status <> 'active'::public.team_status
    or (accepted_at is not null and visibility_acknowledged_at is not null)
  )
);

create unique index if not exists teams_pending_or_active_pair_idx
  on public.teams (user_a_id, user_b_id)
  where status in ('pending', 'active');

create index if not exists teams_user_a_idx on public.teams (user_a_id, status);
create index if not exists teams_user_b_idx on public.teams (user_b_id, status);

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create or replace function private.ensure_single_active_team()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'active'::public.team_status then
    return new;
  end if;

  if exists (
    select 1
    from public.teams team
    where team.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and team.status = 'active'::public.team_status
      and (new.user_a_id in (team.user_a_id, team.user_b_id)
        or new.user_b_id in (team.user_a_id, team.user_b_id))
  ) then
    raise exception using errcode = '23514', message = 'team_already_active';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_single_active_team_trigger on public.teams;
create trigger ensure_single_active_team_trigger
before insert or update on public.teams
for each row
execute function private.ensure_single_active_team();

create table if not exists public.partner_profile_fields (
  field text primary key,
  is_exposed boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now()
);

insert into public.partner_profile_fields (field, is_exposed)
values
  ('username', true),
  ('display_name', true),
  ('avatar_url', true),
  ('timezone', false),
  ('week_starts_on', false)
on conflict (field) do nothing;

create or replace function private.is_active_team_pair(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams team
    where team.status = 'active'::public.team_status
      and (
        (team.user_a_id = p_user_a and team.user_b_id = p_user_b)
        or (team.user_a_id = p_user_b and team.user_b_id = p_user_a)
      )
  );
$$;

create or replace function public.can_view_goal_content(
  p_goal_id uuid,
  p_uid uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.goals goal
    left join public.goal_participants participant
      on participant.goal_id = goal.id
      and participant.user_id = p_uid
    left join public.goal_shares share
      on share.goal_id = goal.id
      and share.shared_with = p_uid
    where goal.id = p_goal_id
      and goal.is_deleted = false
      and (
        goal.owner_id = p_uid
        or participant.user_id is not null
        or share.shared_with is not null
        or (
          goal.is_private = false
          and private.is_active_team_pair(goal.owner_id, p_uid)
        )
      )
  );
$$;

create or replace function public.get_partner_profile_service(
  p_owner_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  v_owner public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_owner_id is null then
    raise exception using errcode = '22023', message = 'owner_required';
  end if;

  if not private.is_active_team_pair(v_uid, p_owner_id) then
    return null;
  end if;

  select profile.*
  into v_owner
  from public.profiles profile
  where profile.id = p_owner_id;

  if not found then
    return null;
  end if;

  if exists (select 1 from public.partner_profile_fields f where f.field = 'username' and f.is_exposed) then
    v_result := v_result || jsonb_build_object('username', v_owner.username);
  end if;
  if exists (select 1 from public.partner_profile_fields f where f.field = 'display_name' and f.is_exposed) then
    v_result := v_result || jsonb_build_object('display_name', v_owner.display_name);
  end if;
  if exists (select 1 from public.partner_profile_fields f where f.field = 'avatar_url' and f.is_exposed) then
    v_result := v_result || jsonb_build_object('avatar_url', v_owner.avatar_url);
  end if;
  if exists (select 1 from public.partner_profile_fields f where f.field = 'timezone' and f.is_exposed) then
    v_result := v_result || jsonb_build_object('timezone', v_owner.timezone);
  end if;
  if exists (select 1 from public.partner_profile_fields f where f.field = 'week_starts_on' and f.is_exposed) then
    v_result := v_result || jsonb_build_object('week_starts_on', v_owner.week_starts_on);
  end if;

  return v_result;
end;
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
    case when team.user_a_id = v_uid then team.user_b_id else team.user_a_id end as partner_id,
    partner.username,
    partner.display_name,
    partner.avatar_url,
    team.invite_message,
    team.invited_at,
    team.accepted_at,
    team.initiator_id <> v_uid as is_incoming
  from public.teams team
  join public.profiles partner
    on partner.id = case when team.user_a_id = v_uid then team.user_b_id else team.user_a_id end
  where v_uid in (team.user_a_id, team.user_b_id)
    and team.status in ('pending', 'active')
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

  update public.teams team
  set
    status = 'active'::public.team_status,
    accepted_at = pg_catalog.now(),
    responded_at = pg_catalog.now(),
    visibility_acknowledged_at = pg_catalog.now()
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and v_uid in (team.user_a_id, team.user_b_id)
  returning case when team.user_a_id = v_uid then team.user_b_id else team.user_a_id end
  into v_partner_id;

  if not found then
    return false;
  end if;

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
    status = 'declined'::public.team_status,
    responded_at = pg_catalog.now()
  where team.id = p_team_id
    and team.status = 'pending'::public.team_status
    and team.initiator_id <> v_uid
    and v_uid in (team.user_a_id, team.user_b_id);

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
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  update public.teams team
  set
    status = 'dissolved'::public.team_status,
    dissolved_at = pg_catalog.now(),
    responded_at = pg_catalog.now()
  where team.status = 'active'::public.team_status
    and v_uid in (team.user_a_id, team.user_b_id);

  return found;
end;
$$;

drop policy if exists goals_select_related_users on public.goals;
create policy goals_select_related_users
on public.goals
for select
to authenticated
using (public.can_view_goal_content(id, (select auth.uid())));

drop policy if exists completions_select_viewable_goal on public.completions;
create policy completions_select_viewable_goal
on public.completions
for select
to authenticated
using (public.can_view_goal_content(goal_id, (select auth.uid())));

alter table public.teams enable row level security;
alter table public.partner_profile_fields enable row level security;

revoke all on table public.teams from public, anon, authenticated;
revoke all on table public.partner_profile_fields from public, anon, authenticated;
grant select, insert, update, delete on table public.teams to service_role;
grant select, insert, update, delete on table public.partner_profile_fields to service_role;

revoke all on function private.ensure_single_active_team()
  from public, anon, authenticated;
revoke all on function private.is_active_team_pair(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.can_view_goal_content(uuid, uuid)
  from public, anon;
grant execute on function public.can_view_goal_content(uuid, uuid)
  to authenticated;

revoke all on function public.get_partner_profile_service(uuid)
  from public, anon;
grant execute on function public.get_partner_profile_service(uuid)
  to authenticated;

revoke all on function public.get_team_state()
  from public, anon;
grant execute on function public.get_team_state()
  to authenticated;

revoke all on function public.create_team_invite_service(uuid, text)
  from public, anon;
grant execute on function public.create_team_invite_service(uuid, text)
  to authenticated;

revoke all on function public.accept_team_invite_service(uuid, boolean)
  from public, anon;
grant execute on function public.accept_team_invite_service(uuid, boolean)
  to authenticated;

revoke all on function public.decline_team_invite_service(uuid)
  from public, anon;
grant execute on function public.decline_team_invite_service(uuid)
  to authenticated;

revoke all on function public.dissolve_team_service()
  from public, anon;
grant execute on function public.dissolve_team_service()
  to authenticated;
