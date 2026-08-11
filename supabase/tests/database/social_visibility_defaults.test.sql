begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(5);

select ok(
  not exists (
    select 1
    from public.goals
    where is_private <> false
  ),
  'existing goals are backfilled to public (is_private=false)'
);

select ok(
  not exists (
    select 1
    from public.profiles
    where social_activity_visible <> true
       or social_competition_eligible <> true
  ),
  'existing profiles are backfilled to social defaults'
);

insert into auth.users (id, email)
values
  ('66111111-1111-4111-8111-111111111111', 'social-a@example.com'),
  ('66222222-2222-4222-8222-222222222222', 'social-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('66111111-1111-4111-8111-111111111111', 's1_user_a'),
  ('66222222-2222-4222-8222-222222222222', 's1_user_b')
on conflict (id) do nothing;

select ok(
  (
    select social_activity_visible
      and social_competition_eligible
    from public.profiles
    where id = '66222222-2222-4222-8222-222222222222'
  ),
  'newly inserted profiles default social participation flags to true'
);

insert into public.goals (
  id,
  owner_id,
  title,
  category,
  frequency_type,
  recurrence_interval,
  target_count,
  start_date,
  end_date,
  is_group
)
values (
  '66444444-4444-4444-8444-444444444444',
  '66222222-2222-4222-8222-222222222222',
  'Social visibility defaults goal',
  'Personal',
  'recurring',
  'weekly',
  3,
  current_date - 1,
  current_date + 30,
  false
)
on conflict (id) do nothing;

select is(
  (
    select is_private::text
    from public.goals
    where id = '66444444-4444-4444-8444-444444444444'
  ),
  'false',
  'new goals default to is_private=false'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'goals_public_visibility_idx'
  ),
  'public visibility partial index exists'
);

select * from finish();
rollback;
