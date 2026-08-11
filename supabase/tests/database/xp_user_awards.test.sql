begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

set local role service_role;

delete from public.user_awards
where user_id = '11111111-1111-4111-8111-111111111111';

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
  'b3500000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'XP user awards lifecycle goal',
  null,
  'health',
  '#10b981',
  'recurring',
  'daily',
  1,
  current_date - 7,
  current_date + 7,
  false
)
on conflict (id) do nothing;

update public.goals
set
  category = 'health',
  category_key = 'health',
  target_count = 1,
  recurrence_interval = 'daily',
  start_date = current_date - 7,
  end_date = current_date + 7,
  is_deleted = false,
  archived_at = null
where id = 'b3500000-0000-4000-8000-000000000001';

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
      'b3500000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'first completion reaches level-2 threshold and unlocks reward'
);

select is(
  (
    select count(*)::integer
    from public.user_awards ua
    join public.xp_rewards xr on xr.id = ua.reward_id
    where ua.user_id = '11111111-1111-4111-8111-111111111111'
      and xr.level = 2
  ),
  1,
  'crossing threshold inserts one user_awards row'
);

select lives_ok(
  $tap$
    select public.unmark_goal_complete(
      'b3500000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  'unmarking reverses xp below reward threshold'
);

select ok(
  exists(
    select 1
    from public.user_awards ua
    join public.xp_rewards xr on xr.id = ua.reward_id
    where ua.user_id = '11111111-1111-4111-8111-111111111111'
      and xr.level = 2
      and ua.revoked_at is not null
  ),
  'reward regression marks revoked_at instead of deleting the row'
);

select lives_ok(
  $tap$
    select public.mark_goal_complete(
      'b3500000-0000-4000-8000-000000000001',
      current_date
    );
  $tap$,
  're-crossing threshold is allowed'
);

select is(
  (
    select count(*)::integer
    from public.user_awards ua
    join public.xp_rewards xr on xr.id = ua.reward_id
    where ua.user_id = '11111111-1111-4111-8111-111111111111'
      and xr.level = 2
  ),
  1,
  're-crossing does not create duplicate unlock rows'
);

set local role service_role;

create temporary table if not exists _xp_award_ctx (
  award_id uuid not null
);
truncate _xp_award_ctx;
grant select on table _xp_award_ctx to authenticated;
insert into _xp_award_ctx (award_id)
select ua.id
from public.user_awards ua
join public.xp_rewards xr on xr.id = ua.reward_id
where ua.user_id = '11111111-1111-4111-8111-111111111111'
  and xr.level = 2
limit 1;

select is(
  public.acknowledge_user_award_service(
    '11111111-1111-4111-8111-111111111111',
    (select award_id from _xp_award_ctx limit 1)
  ),
  true,
  'acknowledge rpc updates row when pending'
);

select is(
  public.acknowledge_user_award_service(
    '11111111-1111-4111-8111-111111111111',
    (select award_id from _xp_award_ctx limit 1)
  ),
  true,
  'acknowledge rpc is idempotent on repeat calls'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $tap$
    select public.acknowledge_user_award_service(
      '11111111-1111-4111-8111-111111111111',
      (select award_id from _xp_award_ctx limit 1)
    );
  $tap$,
  '42501',
  'award_not_owned',
  'authenticated users cannot acknowledge awards they do not own'
);

reset role;
select * from finish();
rollback;
