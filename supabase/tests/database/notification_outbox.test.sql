begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(10);

insert into auth.users (id, email)
values ('9c111111-1111-4111-8111-111111111111', 'outbox-user@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values ('9c111111-1111-4111-8111-111111111111', 'outbox_user')
on conflict (id) do nothing;

set local role service_role;

insert into public.notification_outbox (
  user_id,
  kind,
  title,
  body,
  url,
  dedupe_key
)
values (
  '9c111111-1111-4111-8111-111111111111',
  'nudge'::public.notification_kind,
  'Outbox title',
  'Outbox body',
  '/social',
  'outbox-dedupe-key'
)
on conflict (user_id, dedupe_key)
where dedupe_key is not null
do nothing;

insert into public.notification_outbox (
  user_id,
  kind,
  title,
  body,
  url,
  dedupe_key
)
values (
  '9c111111-1111-4111-8111-111111111111',
  'nudge'::public.notification_kind,
  'Outbox title',
  'Outbox body',
  '/social',
  'outbox-dedupe-key'
)
on conflict (user_id, dedupe_key)
where dedupe_key is not null
do nothing;

select is(
  (
    select count(*)::integer
    from public.notification_outbox outbox
    where outbox.user_id = '9c111111-1111-4111-8111-111111111111'
      and outbox.dedupe_key = 'outbox-dedupe-key'
  ),
  1,
  'dedupe key keeps only one logical pending notification'
);

create temporary table _claimed as
select *
from public.claim_notification_outbox_service(10);

select is(
  (
    select attempts::integer
    from _claimed
    where user_id = '9c111111-1111-4111-8111-111111111111'
  ),
  1,
  'claim increments attempts before dispatch'
);

select ok(
  public.resolve_notification_outbox_delivery_service(
    (select id from _claimed limit 1),
    false,
    'temporary_failure'
  ),
  'failed delivery updates outbox row'
);

select is(
  (
    select state
    from public.notification_outbox outbox
    where outbox.id = (select id from _claimed limit 1)
  ),
  'pending'::public.notification_state,
  'failed delivery remains pending for retry before max attempts'
);

select ok(
  public.resolve_notification_outbox_delivery_service(
    (select id from _claimed limit 1),
    false,
    'web_configuration_unavailable'
  ),
  'configuration outage defers the outbox row'
);

select is(
  (
    select attempts::integer
    from public.notification_outbox outbox
    where outbox.id = (select id from _claimed limit 1)
  ),
  0,
  'configuration outage restores the consumed attempt'
);

select ok(
  public.resolve_notification_outbox_delivery_service(
    (select id from _claimed limit 1),
    true,
    null
  ),
  'successful delivery marks outbox row as sent'
);

insert into public.notification_outbox (
  user_id,
  kind,
  title,
  body,
  url,
  dedupe_key
)
values (
  '9c111111-1111-4111-8111-111111111111',
  'reaction'::public.notification_kind,
  'Outbox title',
  'Outbox body',
  '/social',
  'outbox-disabled-by-pref'
)
on conflict (user_id, dedupe_key)
where dedupe_key is not null
do nothing;

create temporary table _claimed_disabled as
select *
from public.claim_notification_outbox_service(10);

select ok(
  public.resolve_notification_outbox_delivery_service(
    (
      select id
      from _claimed_disabled
      where kind = 'reaction'::public.notification_kind
      limit 1
    ),
    false,
    'disabled_by_user_preference'
  ),
  'disabled preference transitions outbox row to skipped'
);

select is(
  (
    select state
    from public.notification_outbox outbox
    where outbox.id = (
      select id
      from _claimed_disabled
      where kind = 'reaction'::public.notification_kind
      limit 1
    )
  ),
  'skipped'::public.notification_state,
  'disabled preference marks state as skipped'
);

select is(
  (
    select last_error
    from public.notification_outbox outbox
    where outbox.id = (
      select id
      from _claimed_disabled
      where kind = 'reaction'::public.notification_kind
      limit 1
    )
  ),
  'disabled_by_user_preference',
  'disabled preference captures explicit skip reason'
);

select * from finish();
rollback;
