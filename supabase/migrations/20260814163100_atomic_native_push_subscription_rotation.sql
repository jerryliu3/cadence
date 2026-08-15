create or replace function public.replace_native_push_subscription_service(
  p_user_id uuid,
  p_platform text,
  p_native_token text,
  p_endpoint text,
  p_user_agent text default null,
  p_updated_at timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'user_id_required';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception using errcode = '22023', message = 'native_platform_invalid';
  end if;
  if p_native_token is null
    or char_length(pg_catalog.btrim(p_native_token)) not between 8 and 4096
  then
    raise exception using errcode = '22023', message = 'native_token_invalid';
  end if;
  if p_endpoint is distinct from
    ('native:' || p_platform || ':' || p_native_token)
  then
    raise exception using errcode = '22023', message = 'native_endpoint_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_platform, 0)
  );

  delete from public.push_subscriptions subscription
  where subscription.user_id = p_user_id
    and subscription.platform = p_platform;

  insert into public.push_subscriptions (
    user_id,
    platform,
    native_token,
    endpoint,
    p256dh,
    auth,
    user_agent,
    updated_at
  )
  values (
    p_user_id,
    p_platform,
    p_native_token,
    p_endpoint,
    null,
    null,
    left(p_user_agent, 1000),
    coalesce(p_updated_at, pg_catalog.now())
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    native_token = excluded.native_token,
    p256dh = null,
    auth = null,
    user_agent = excluded.user_agent,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.replace_native_push_subscription_service(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.replace_native_push_subscription_service(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;
