-- Additive native push credentials on the existing web-push subscription table.
-- Web rows keep VAPID keys; native rows store Expo/APNs/FCM device tokens.

alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

alter table public.push_subscriptions
  add column if not exists native_token text;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check
  check (platform in ('web', 'ios', 'android'));

alter table public.push_subscriptions
  alter column p256dh drop not null;

alter table public.push_subscriptions
  alter column auth drop not null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_credentials_check;

alter table public.push_subscriptions
  add constraint push_subscriptions_platform_credentials_check
  check (
    (
      platform = 'web'
      and p256dh is not null
      and auth is not null
    )
    or (
      platform in ('ios', 'android')
      and native_token is not null
      and char_length(btrim(native_token)) between 8 and 4096
    )
  );

create index if not exists push_subscriptions_native_token_idx
on public.push_subscriptions (native_token)
where native_token is not null;
