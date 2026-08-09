-- Social Phase 9:
-- Duo planner read/proposal surfaces with owner-accepted application.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'planner_proposal_status'
  ) then
    create type public.planner_proposal_status as enum (
      'pending',
      'accepted',
      'rejected',
      'withdrawn',
      'stale',
      'expired'
    );
  end if;
end;
$$;

alter table public.duo_preferences
add column if not exists share_planner boolean not null default true;

alter table public.duo_preferences
add column if not exists allow_proposals boolean not null default true;

create table if not exists public.planner_proposals (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.duos(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  target_owner_id uuid not null references public.profiles(id) on delete cascade,
  scope_month date not null,
  status public.planner_proposal_status not null default 'pending',
  baseline_schedule_digest text not null,
  operations jsonb not null,
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  applied_digest text,
  constraint planner_proposals_distinct check (proposer_id <> target_owner_id),
  constraint planner_proposals_month_first check (extract(day from scope_month) = 1),
  constraint planner_proposals_ops_array check (jsonb_typeof(operations) = 'array'),
  constraint planner_proposals_ops_bounded check (jsonb_array_length(operations) between 1 and 50),
  constraint planner_proposals_ops_octets check (octet_length(operations::text) <= 32768),
  constraint planner_proposals_note_len check (note is null or char_length(note) <= 500)
);

create unique index if not exists planner_proposals_one_pending
  on public.planner_proposals (duo_id, target_owner_id, scope_month)
  where status = 'pending'::public.planner_proposal_status;

create index if not exists planner_proposals_target_idx
  on public.planner_proposals (target_owner_id, status, created_at desc);

create or replace function private.validate_planner_proposal_operations(
  p_operations jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_op text;
  v_goal_id text;
  v_unit_key text;
  v_to_date text;
  v_to_time text;
  v_locked jsonb;
begin
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_operations_payload';
  end if;

  for v_entry in
    select value
    from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_operation_entry';
    end if;

    v_op := coalesce(v_entry->>'op', '');

    if v_op = 'move_item' then
      v_goal_id := coalesce(v_entry->>'goalId', '');
      v_unit_key := coalesce(v_entry->>'unitKey', '');
      v_to_date := coalesce(v_entry->>'toDate', '');
      v_to_time := nullif(v_entry->>'toTime', '');

      if v_goal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'invalid_move_goal_id';
      end if;
      if char_length(v_unit_key) < 1 or char_length(v_unit_key) > 120 then
        raise exception using errcode = '22023', message = 'invalid_move_unit_key';
      end if;
      begin
        perform v_to_date::date;
      exception
        when others then
          raise exception using errcode = '22023', message = 'invalid_move_date';
      end;
      if v_to_time is not null and v_to_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception using errcode = '22023', message = 'invalid_move_time';
      end if;
    elsif v_op = 'lock_item' then
      v_goal_id := coalesce(v_entry->>'goalId', '');
      v_unit_key := coalesce(v_entry->>'unitKey', '');
      v_locked := v_entry->'locked';

      if v_goal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '22023', message = 'invalid_lock_goal_id';
      end if;
      if char_length(v_unit_key) < 1 or char_length(v_unit_key) > 120 then
        raise exception using errcode = '22023', message = 'invalid_lock_unit_key';
      end if;
      if jsonb_typeof(v_locked) <> 'boolean' then
        raise exception using errcode = '22023', message = 'invalid_lock_value';
      end if;
    elsif v_op = 'clear_month' then
      continue;
    else
      raise exception using errcode = '22023', message = 'invalid_operation_type';
    end if;
  end loop;
end;
$$;

create or replace function private.planner_schedule_digest_for_owner(
  p_owner uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select private.sha256_hex_digest(
    coalesce(
      string_agg(
        format(
          '%s|%s|%s|%s|%s|%s',
          item.goal_id::text,
          item.unit_key,
          item.scheduled_date::text,
          coalesce(item.original_scheduled_date::text, ''),
          coalesce(item.scheduled_time, ''),
          case when item.locked then '1' else '0' end
        ),
        ',' order by item.goal_id, item.unit_key
      ),
      'empty'
    )
  )
  from public.planner_items item
  where item.owner_id = p_owner;
$$;

create or replace function public.get_duo_partner_plan_service(
  p_scope_month date
)
returns table (
  item_id uuid,
  owner_id uuid,
  goal_id uuid,
  goal_title text,
  unit_key text,
  scheduled_date date,
  scheduled_time text,
  locked boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_duo_id uuid;
  v_partner_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_scope_month is null or extract(day from p_scope_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  select
    duo.id,
    case
      when duo.user_a_id = v_uid then duo.user_b_id
      else duo.user_a_id
    end
  into v_duo_id, v_partner_id
  from public.duos duo
  where duo.status = 'active'::public.duo_status
    and v_uid in (duo.user_a_id, duo.user_b_id)
  order by duo.accepted_at desc nulls last
  limit 1;

  if v_duo_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.duo_preferences pref
    where pref.duo_id = v_duo_id
      and pref.user_id = v_partner_id
      and pref.share_planner = true
  ) then
    return;
  end if;

  return query
  select
    item.id,
    item.owner_id,
    item.goal_id,
    goal.title,
    item.unit_key,
    item.scheduled_date,
    item.scheduled_time,
    item.locked
  from public.planner_items item
  join public.goals goal on goal.id = item.goal_id
  where item.owner_id = v_partner_id
    and date_trunc('month', item.scheduled_date)::date = p_scope_month
    and goal.partner_visibility = 'shared'::public.goal_partner_visibility
    and goal.is_deleted = false
  order by item.scheduled_date asc, item.goal_id asc, item.unit_key asc;
end;
$$;

create or replace function public.create_planner_proposal_service(
  p_target_owner_id uuid,
  p_scope_month date,
  p_operations jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_duo_id uuid;
  v_baseline_digest text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_target_owner_id is null or p_target_owner_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_target_owner';
  end if;
  if p_scope_month is null or extract(day from p_scope_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  perform private.validate_planner_proposal_operations(p_operations);

  select duo.id
  into v_duo_id
  from public.duos duo
  where duo.status = 'active'::public.duo_status
    and (
      (duo.user_a_id = v_uid and duo.user_b_id = p_target_owner_id)
      or (duo.user_b_id = v_uid and duo.user_a_id = p_target_owner_id)
    )
  limit 1;

  if v_duo_id is null then
    raise exception using errcode = '22023', message = 'duo_required';
  end if;

  if not exists (
    select 1
    from public.duo_preferences pref
    where pref.duo_id = v_duo_id
      and pref.user_id = p_target_owner_id
      and pref.allow_proposals = true
  ) then
    raise exception using errcode = '42501', message = 'proposals_not_allowed';
  end if;

  v_baseline_digest := private.planner_schedule_digest_for_owner(p_target_owner_id);

  begin
    insert into public.planner_proposals (
      duo_id,
      proposer_id,
      target_owner_id,
      scope_month,
      baseline_schedule_digest,
      operations,
      note
    )
    values (
      v_duo_id,
      v_uid,
      p_target_owner_id,
      p_scope_month,
      v_baseline_digest,
      p_operations,
      nullif(btrim(coalesce(p_note, '')), '')
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'proposal_already_pending';
  end;

  if private.partner_notifications_allowed(v_duo_id, p_target_owner_id) then
    perform private.enqueue_notification_outbox(
      p_user_id => p_target_owner_id,
      p_kind => 'planner_proposal'::public.notification_kind,
      p_title => 'New planner proposal',
      p_body => 'Your duo partner proposed planner updates for review.',
      p_url => '/social?tab=duo',
      p_dedupe_key => 'planner-proposal:' || v_id::text
    );
  end if;

  return v_id;
end;
$$;

create or replace function public.get_planner_proposals_service(
  p_scope_month date default null
)
returns table (
  id uuid,
  duo_id uuid,
  proposer_id uuid,
  target_owner_id uuid,
  scope_month date,
  status public.planner_proposal_status,
  baseline_schedule_digest text,
  operations jsonb,
  note text,
  created_at timestamptz,
  decided_at timestamptz,
  applied_digest text
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
  if p_scope_month is not null and extract(day from p_scope_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  return query
  select
    proposal.id,
    proposal.duo_id,
    proposal.proposer_id,
    proposal.target_owner_id,
    proposal.scope_month,
    proposal.status,
    proposal.baseline_schedule_digest,
    proposal.operations,
    proposal.note,
    proposal.created_at,
    proposal.decided_at,
    proposal.applied_digest
  from public.planner_proposals proposal
  where (proposal.proposer_id = v_uid or proposal.target_owner_id = v_uid)
    and (p_scope_month is null or proposal.scope_month = p_scope_month)
  order by proposal.created_at desc
  limit 100;
end;
$$;

create or replace function public.resolve_planner_proposal_service(
  p_proposal_id uuid,
  p_resolution public.planner_proposal_status,
  p_applied_digest text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposer_id uuid;
  v_target_owner_id uuid;
  v_duo_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_proposal_id is null then
    raise exception using errcode = '22023', message = 'proposal_id_required';
  end if;
  if p_resolution not in (
    'accepted'::public.planner_proposal_status,
    'rejected'::public.planner_proposal_status,
    'withdrawn'::public.planner_proposal_status,
    'stale'::public.planner_proposal_status
  ) then
    raise exception using errcode = '22023', message = 'invalid_proposal_resolution';
  end if;
  if p_resolution = 'accepted'::public.planner_proposal_status
    and (p_applied_digest is null or char_length(btrim(p_applied_digest)) = 0) then
    raise exception using errcode = '22023', message = 'applied_digest_required';
  end if;

  if p_resolution = 'withdrawn'::public.planner_proposal_status then
    update public.planner_proposals proposal
    set
      status = 'withdrawn'::public.planner_proposal_status,
      decided_at = pg_catalog.now()
    where proposal.id = p_proposal_id
      and proposal.status = 'pending'::public.planner_proposal_status
      and proposal.proposer_id = v_uid;
    return found;
  end if;

  update public.planner_proposals proposal
  set
    status = p_resolution,
    decided_at = pg_catalog.now(),
    applied_digest = case
      when p_resolution = 'accepted'::public.planner_proposal_status then p_applied_digest
      else null
    end
  where proposal.id = p_proposal_id
    and proposal.status = 'pending'::public.planner_proposal_status
    and proposal.target_owner_id = v_uid
  returning proposal.proposer_id, proposal.target_owner_id, proposal.duo_id
  into v_proposer_id, v_target_owner_id, v_duo_id;

  if not found then
    return false;
  end if;

  if private.partner_notifications_allowed(v_duo_id, v_proposer_id) then
    perform private.enqueue_notification_outbox(
      p_user_id => v_proposer_id,
      p_kind => 'planner_proposal_decided'::public.notification_kind,
      p_title => 'Planner proposal updated',
      p_body => case p_resolution
        when 'accepted'::public.planner_proposal_status then 'Your planner proposal was accepted.'
        when 'rejected'::public.planner_proposal_status then 'Your planner proposal was rejected.'
        else 'Your planner proposal became stale.'
      end,
      p_url => '/social?tab=duo',
      p_dedupe_key => 'planner-proposal-resolution:' || p_proposal_id::text || ':' || p_resolution::text
    );
  end if;

  return true;
end;
$$;

create or replace function public.expire_planner_proposals_service()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  update public.planner_proposals proposal
  set
    status = 'expired'::public.planner_proposal_status,
    decided_at = pg_catalog.now()
  where proposal.status = 'pending'::public.planner_proposal_status
    and proposal.created_at < pg_catalog.now() - interval '7 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.planner_proposals enable row level security;

revoke all on table public.planner_proposals from public, anon, authenticated;
grant select, insert, update, delete on table public.planner_proposals to service_role;

revoke all on function private.validate_planner_proposal_operations(jsonb)
  from public, anon, authenticated;
revoke all on function private.planner_schedule_digest_for_owner(uuid)
  from public, anon, authenticated;

revoke all on function public.get_duo_partner_plan_service(date)
  from public, anon;
grant execute on function public.get_duo_partner_plan_service(date)
  to authenticated;

revoke all on function public.create_planner_proposal_service(
  uuid,
  date,
  jsonb,
  text
)
  from public, anon;
grant execute on function public.create_planner_proposal_service(
  uuid,
  date,
  jsonb,
  text
)
  to authenticated;

revoke all on function public.get_planner_proposals_service(date)
  from public, anon;
grant execute on function public.get_planner_proposals_service(date)
  to authenticated;

revoke all on function public.resolve_planner_proposal_service(
  uuid,
  public.planner_proposal_status,
  text
)
  from public, anon;
grant execute on function public.resolve_planner_proposal_service(
  uuid,
  public.planner_proposal_status,
  text
)
  to authenticated;

revoke all on function public.expire_planner_proposals_service()
  from public, anon, authenticated;
grant execute on function public.expire_planner_proposals_service()
  to service_role;

do $cron$
begin
  begin
    perform cron.unschedule('expire-planner-proposals-daily');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'expire-planner-proposals-daily',
    '27 4 * * *',
    $job$select public.expire_planner_proposals_service()$job$
  );
exception
  when others then null;
end;
$cron$;
