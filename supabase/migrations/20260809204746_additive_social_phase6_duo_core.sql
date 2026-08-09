-- Social Phase 6:
-- Duo lifecycle and partner visibility projection.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'duo_status'
  ) then
    create type public.duo_status as enum (
      'pending',
      'active',
      'declined',
      'cancelled',
      'dissolved'
    );
  end if;
end;
$$;

create table if not exists public.duos (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  status public.duo_status not null default 'pending',
  invite_message text,
  visibility_acknowledged_at timestamptz,
  invited_at timestamptz not null default pg_catalog.now(),
  accepted_at timestamptz,
  responded_at timestamptz,
  dissolved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint duos_distinct_users check (user_a_id <> user_b_id),
  constraint duos_canonical_pair check (user_a_id < user_b_id),
  constraint duos_initiator_in_pair check (initiator_id in (user_a_id, user_b_id)),
  constraint duos_message_length check (
    invite_message is null or pg_catalog.length(invite_message) <= 400
  ),
  constraint duos_accept_fields check (
    status <> 'active'::public.duo_status
    or (accepted_at is not null and visibility_acknowledged_at is not null)
  )
);

create unique index if not exists duos_pending_or_active_pair_idx
  on public.duos (user_a_id, user_b_id)
  where status in ('pending', 'active');

create index if not exists duos_user_a_idx on public.duos (user_a_id, status);
create index if not exists duos_user_b_idx on public.duos (user_b_id, status);

drop trigger if exists set_duos_updated_at on public.duos;
create trigger set_duos_updated_at
before update on public.duos
for each row execute function public.set_updated_at();

create or replace function private.ensure_single_active_duo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'active'::public.duo_status then
    return new;
  end if;

  if exists (
    select 1
    from public.duos duo
    where duo.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and duo.status = 'active'::public.duo_status
      and (new.user_a_id in (duo.user_a_id, duo.user_b_id)
        or new.user_b_id in (duo.user_a_id, duo.user_b_id))
  ) then
    raise exception using errcode = '23514', message = 'duo_already_active';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_single_active_duo_trigger on public.duos;
create trigger ensure_single_active_duo_trigger
before insert or update on public.duos
for each row
execute function private.ensure_single_active_duo();

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

create or replace function private.is_active_duo_pair(
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
    from public.duos duo
    where duo.status = 'active'::public.duo_status
      and (
        (duo.user_a_id = p_user_a and duo.user_b_id = p_user_b)
        or (duo.user_a_id = p_user_b and duo.user_b_id = p_user_a)
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
          goal.partner_visibility = 'shared'::public.goal_partner_visibility
          and private.is_active_duo_pair(goal.owner_id, p_uid)
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

  if not private.is_active_duo_pair(v_uid, p_owner_id) then
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

create or replace function public.get_duo_state()
returns table (
  duo_id uuid,
  status public.duo_status,
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
    duo.id,
    duo.status,
    case when duo.user_a_id = v_uid then duo.user_b_id else duo.user_a_id end as partner_id,
    partner.username,
    partner.display_name,
    partner.avatar_url,
    duo.invite_message,
    duo.invited_at,
    duo.accepted_at,
    duo.initiator_id <> v_uid as is_incoming
  from public.duos duo
  join public.profiles partner
    on partner.id = case when duo.user_a_id = v_uid then duo.user_b_id else duo.user_a_id end
  where v_uid in (duo.user_a_id, duo.user_b_id)
    and duo.status in ('pending', 'active')
  order by duo.invited_at desc;
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

  return v_duo_id;
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

  return true;
end;
$$;

create or replace function public.decline_duo_invite_service(
  p_duo_id uuid
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
  if p_duo_id is null then
    raise exception using errcode = '22023', message = 'duo_id_required';
  end if;

  update public.duos duo
  set
    status = 'declined'::public.duo_status,
    responded_at = pg_catalog.now()
  where duo.id = p_duo_id
    and duo.status = 'pending'::public.duo_status
    and duo.initiator_id <> v_uid
    and v_uid in (duo.user_a_id, duo.user_b_id);

  return found;
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
    and v_uid in (duo.user_a_id, duo.user_b_id);

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

alter table public.duos enable row level security;
alter table public.partner_profile_fields enable row level security;

revoke all on table public.duos from public, anon, authenticated;
revoke all on table public.partner_profile_fields from public, anon, authenticated;
grant select, insert, update, delete on table public.duos to service_role;
grant select, insert, update, delete on table public.partner_profile_fields to service_role;

revoke all on function private.ensure_single_active_duo()
  from public, anon, authenticated;
revoke all on function private.is_active_duo_pair(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.can_view_goal_content(uuid, uuid)
  from public, anon;
grant execute on function public.can_view_goal_content(uuid, uuid)
  to authenticated;

revoke all on function public.get_partner_profile_service(uuid)
  from public, anon;
grant execute on function public.get_partner_profile_service(uuid)
  to authenticated;

revoke all on function public.get_duo_state()
  from public, anon;
grant execute on function public.get_duo_state()
  to authenticated;

revoke all on function public.create_duo_invite_service(uuid, text)
  from public, anon;
grant execute on function public.create_duo_invite_service(uuid, text)
  to authenticated;

revoke all on function public.accept_duo_invite_service(uuid, boolean)
  from public, anon;
grant execute on function public.accept_duo_invite_service(uuid, boolean)
  to authenticated;

revoke all on function public.decline_duo_invite_service(uuid)
  from public, anon;
grant execute on function public.decline_duo_invite_service(uuid)
  to authenticated;

revoke all on function public.dissolve_duo_service()
  from public, anon;
grant execute on function public.dissolve_duo_service()
  to authenticated;
