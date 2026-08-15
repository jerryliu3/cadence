begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(14);

insert into auth.users (id, email)
values ('9c222222-2222-4222-8222-222222222222', 'native-push@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values ('9c222222-2222-4222-8222-222222222222', 'native_push_user')
on conflict (id) do nothing;

set local role service_role;

select lives_ok(
  $$
    select public.replace_native_push_subscription_service(
      '9c222222-2222-4222-8222-222222222222',
      'ios',
      'ExponentPushToken[old]',
      'native:ios:ExponentPushToken[old]',
      'pgTAP',
      pg_catalog.now()
    )
  $$,
  'service role can register a native push token'
);

select lives_ok(
  $$
    select public.replace_native_push_subscription_service(
      '9c222222-2222-4222-8222-222222222222',
      'ios',
      'ExponentPushToken[new]',
      'native:ios:ExponentPushToken[new]',
      'pgTAP',
      pg_catalog.now()
    )
  $$,
  'service role can atomically rotate a native push token'
);

select is(
  (
    select count(*)::integer
    from public.push_subscriptions subscription
    where subscription.user_id = '9c222222-2222-4222-8222-222222222222'
      and subscription.platform = 'ios'
  ),
  1,
  'rotation leaves one native token for the user and platform'
);

select is(
  (
    select subscription.native_token
    from public.push_subscriptions subscription
    where subscription.user_id = '9c222222-2222-4222-8222-222222222222'
      and subscription.platform = 'ios'
  ),
  'ExponentPushToken[new]',
  'rotation keeps the newest native token'
);

select throws_ok(
  $$
    select public.replace_native_push_subscription_service(
      '9c222222-2222-4222-8222-222222222222',
      null::text,
      'ExponentPushToken[new]',
      'native:ios:ExponentPushToken[new]',
      'pgTAP',
      pg_catalog.now()
    )
  $$,
  '22023',
  'native_platform_invalid',
  'native rotation rejects a missing platform explicitly'
);

select throws_ok(
  $$
    insert into public.push_subscriptions (
      user_id,
      platform,
      endpoint,
      p256dh,
      auth
    )
    values (
      '9c222222-2222-4222-8222-222222222222',
      'web',
      'native:web:reserved',
      'p256dh',
      'auth'
    )
  $$,
  '23514',
  null,
  'web rows cannot enter the reserved native endpoint namespace'
);

select throws_ok(
  $$
    insert into public.push_subscriptions (
      user_id,
      endpoint,
      platform,
      native_token,
      p256dh,
      auth
    )
    values (
      '9c222222-2222-4222-8222-222222222222',
      'native:ios:short',
      'ios',
      'short',
      null,
      null
    )
  $$,
  '23514',
  null,
  'native tokens shorter than 8 characters are rejected'
);

select throws_ok(
  $$
    insert into public.push_subscriptions (
      user_id,
      endpoint,
      platform,
      native_token,
      p256dh,
      auth
    )
    values (
      '9c222222-2222-4222-8222-222222222222',
      'https://example.test/web-missing-keys',
      'web',
      null,
      null,
      null
    )
  $$,
  '23514',
  null,
  'web rows still require p256dh and auth'
);

reset role;

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.replace_native_push_subscription_service(uuid,text,text,text,text,timestamptz)',
    'execute'
  ),
  false,
  'authenticated callers cannot invoke the native token service directly'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '9c222222-2222-4222-8222-222222222222',
  true
);

select throws_ok(
  $$
    insert into public.push_subscriptions (
      user_id,
      platform,
      native_token,
      endpoint,
      p256dh,
      auth
    )
    values (
      '9c222222-2222-4222-8222-222222222222',
      'android',
      'ExponentPushToken[bypass]',
      'native:android:ExponentPushToken[bypass]',
      null,
      null
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "push_subscriptions"',
  'authenticated callers cannot insert native credentials directly'
);

select lives_ok(
  $$
    insert into public.push_subscriptions (
      user_id,
      platform,
      endpoint,
      p256dh,
      auth
    )
    values (
      '9c222222-2222-4222-8222-222222222222',
      'web',
      'https://push.example.test/subscription',
      'p256dh',
      'auth'
    )
  $$,
  'authenticated callers retain web subscription writes'
);

select throws_ok(
  $$
    update public.push_subscriptions
    set
      platform = 'android',
      native_token = 'ExponentPushToken[bypass]',
      endpoint = 'native:android:ExponentPushToken[bypass]',
      p256dh = null,
      auth = null
    where endpoint = 'https://push.example.test/subscription'
  $$,
  '42501',
  'new row violates row-level security policy for table "push_subscriptions"',
  'authenticated callers cannot convert web rows into native credentials'
);

select lives_ok(
  $$
    delete from public.push_subscriptions
    where platform = 'ios'
  $$,
  'direct native deletion is filtered by RLS'
);

reset role;
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.push_subscriptions subscription
    where subscription.user_id = '9c222222-2222-4222-8222-222222222222'
      and subscription.platform = 'ios'
  ),
  1,
  'direct authenticated deletion cannot remove native credentials'
);

select * from finish();
rollback;
