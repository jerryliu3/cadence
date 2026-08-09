begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(7);

insert into auth.users (id, email)
values
  ('8f111111-1111-4111-8111-111111111111', 'duo-a@example.com'),
  ('8f222222-2222-4222-8222-222222222222', 'duo-b@example.com'),
  ('8f333333-3333-4333-8333-333333333333', 'duo-c@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, username)
values
  ('8f111111-1111-4111-8111-111111111111', 'duo_user_a'),
  ('8f222222-2222-4222-8222-222222222222', 'duo_user_b'),
  ('8f333333-3333-4333-8333-333333333333', 'duo_user_c')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f111111-1111-4111-8111-111111111111', true);

select set_config(
  'request.duo_id',
  public.create_duo_invite_service(
    '8f222222-2222-4222-8222-222222222222',
    'hey lets pair'
  )::text,
  true
);

reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.duos duo
    where duo.id = current_setting('request.duo_id')::uuid
      and duo.user_a_id = '8f111111-1111-4111-8111-111111111111'
      and duo.user_b_id = '8f222222-2222-4222-8222-222222222222'
      and duo.status = 'pending'
  ),
  1,
  'invite is created in canonical pair order'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f222222-2222-4222-8222-222222222222', true);
select public.create_duo_invite_service(
  '8f111111-1111-4111-8111-111111111111',
  'reciprocal'
);

reset role;
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.duos duo
    where duo.user_a_id = '8f111111-1111-4111-8111-111111111111'
      and duo.user_b_id = '8f222222-2222-4222-8222-222222222222'
      and duo.status = 'pending'
  ),
  1,
  'reciprocal invite reuses same pending duo row'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    $$select public.accept_duo_invite_service('%s'::uuid, false)$$,
    current_setting('request.duo_id')
  ),
  '22023',
  'visibility_ack_required',
  'accept requires visibility acknowledgement'
);

select ok(
  public.accept_duo_invite_service(
    current_setting('request.duo_id')::uuid,
    true
  ),
  'invitee can accept with acknowledgement'
);

reset role;
set local role service_role;
select is(
  (
    select status
    from public.duos
    where id = current_setting('request.duo_id')::uuid
  ),
  'active'::public.duo_status,
  'accepted invite transitions duo to active'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8f111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$select public.create_duo_invite_service('8f333333-3333-4333-8333-333333333333', null)$$,
  '23514',
  'duo_already_active',
  'single active duo guard prevents second active pair for same user'
);

select ok(
  public.dissolve_duo_service(),
  'active duo can be dissolved by either member'
);

select * from finish();
rollback;
