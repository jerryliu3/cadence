alter table public.push_subscriptions
  add constraint push_subscriptions_native_endpoint_canonical
  check (
    platform = 'web'
    or endpoint = ('native:' || platform || ':' || native_token)
  )
  not valid;

alter table public.push_subscriptions
  validate constraint push_subscriptions_native_endpoint_canonical;
