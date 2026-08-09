begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(14);

set local role service_role;

delete from public.xp_ledger
where user_id = '11111111-1111-4111-8111-111111111111';

delete from public.xp_profiles
where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.goals (
  id,
  owner_id,
  title,
  description,
  category,
  color,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_group
)
values (
  'b3400000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'XP recompute integration goal',
  null,
  'health',
  '#10b981',
  'recurring',
  'weekly',
  5,
  current_date - 30,
  current_date + 30,
  false
)
on conflict (id) do nothing;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'first completion write succeeds'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
  ),
  10,
  'first completion yields 10 goal XP'
);

select is(
  (
    select p.total_xp
    from public.xp_profiles p
    where p.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  10,
  'profile total xp refreshes after completion write'
);

select is(
  (
    select p.current_level
    from public.xp_profiles p
    where p.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1,
  'level remains at 1 under first threshold'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'duplicate same-day completion call remains idempotent'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
  ),
  10,
  'duplicate completion does not mint extra xp'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date - 1
    );
  $tap$,
  'second distinct completion write succeeds'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
  ),
  20,
  'second completion lifts recomputed goal xp to 20'
);

select lives_ok(
  $tap$
    select public.unmark_goal_complete(
      'b3400000-0000-4000-8000-000000000001',
      current_date - 1
    );
  $tap$,
  'unmark completion succeeds'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.goal_id = 'b3400000-0000-4000-8000-000000000001'
  ),
  10,
  'recompute writes reversal delta after completion removal'
);

reset role;
set local role service_role;

select is(
  (
    select applied
    from public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      25,
      'global',
      'xp-foundation-test',
      'xp-foundation-event-1',
      current_date
    )
  ),
  true,
  'first social award event applies'
);

select is(
  (
    select applied
    from public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      25,
      'global',
      'xp-foundation-test',
      'xp-foundation-event-1',
      current_date
    )
  ),
  false,
  'duplicate social source event is idempotent'
);

select is(
  (
    select coalesce(sum(l.xp_delta), 0)::integer
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.source_event_id = 'xp-foundation-event-1'
  ),
  25,
  'social event id contributes xp exactly once'
);

select is(
  (
    select p.total_xp
    from public.xp_profiles p
    where p.user_id = '11111111-1111-4111-8111-111111111111'
  ),
  35,
  'profile total includes goal and social xp after refresh'
);

reset role;
select * from finish();
rollback;
