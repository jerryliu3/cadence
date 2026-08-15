alter table public.push_subscriptions
  add constraint push_subscriptions_web_endpoint_https
  check (
    platform <> 'web'
    or endpoint like 'https://%'
  )
  not valid;

alter table public.push_subscriptions
  validate constraint push_subscriptions_web_endpoint_https;
