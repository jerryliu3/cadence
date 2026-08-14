begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(6);

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

select * from finish();
rollback;
