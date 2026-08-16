-- Keep notification preference mapping in one place (application delivery gate).
-- Outbox enqueue remains a durable write path and does not apply category filtering.

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

drop function if exists private.notification_preference_allows_kind(
  uuid,
  public.notification_kind
);
