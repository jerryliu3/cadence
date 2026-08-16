-- Enforce notification category preferences in durable push delivery paths.

create or replace function private.notification_preference_allows_kind(
  p_user_id uuid,
  p_kind public.notification_kind
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_preference_key text;
  v_enabled boolean;
begin
  if p_kind in (
    'team_invite'::public.notification_kind,
    'team_accepted'::public.notification_kind,
    'team_dissolved'::public.notification_kind
  ) then
    v_preference_key := 'team_updates';
  elsif p_kind in (
    'nudge'::public.notification_kind,
    'reaction'::public.notification_kind
  ) then
    v_preference_key := 'partner_activity';
  else
    return true;
  end if;

  select (profile.notification_preferences ->> v_preference_key)::boolean
  into v_enabled
  from public.profiles profile
  where profile.id = p_user_id;

  return coalesce(v_enabled, true);
end;
$$;

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

  if not private.notification_preference_allows_kind(p_user_id, p_kind) then
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

  if p_error = 'disabled_by_user_preference' then
    update public.notification_outbox outbox
    set
      state = 'skipped'::public.notification_state,
      last_error = p_error
    where outbox.id = p_outbox_id
      and outbox.state = 'pending'::public.notification_state;
    return found;
  end if;

  if p_error = 'web_configuration_unavailable' then
    update public.notification_outbox outbox
    set
      attempts = greatest(outbox.attempts::integer - 1, 0)::smallint,
      available_at = pg_catalog.now() + interval '5 minutes',
      last_error = p_error
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

revoke all on function private.notification_preference_allows_kind(
  uuid,
  public.notification_kind
) from public, anon, authenticated;

revoke all on function private.enqueue_notification_outbox(
  uuid,
  public.notification_kind,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
