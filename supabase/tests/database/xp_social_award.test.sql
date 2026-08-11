begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(9);

set local role service_role;

delete from public.xp_ledger
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

delete from public.xp_profiles
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

update public.profiles
set timezone = case
  when id = '11111111-1111-4111-8111-111111111111' then 'UTC'
  when id = '22222222-2222-4222-8222-222222222222' then 'Pacific/Auckland'
  else timezone
end
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

select throws_ok(
  $tap$
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'completion_credit',
      'bad:event',
      10
    );
  $tap$,
  '22023',
  'invalid_social_event_type',
  'social award rejects out-of-contract event types'
);

select throws_ok(
  $tap$
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:zero',
      0
    );
  $tap$,
  '22023',
  'invalid_xp_delta',
  'social award rejects zero-delta calls'
);

select ok(
  (
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:one',
      15
    )
  ) is not null,
  'first social award inserts row and returns seq'
);

select ok(
  (
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:one',
      15
    )
  ) is null,
  'duplicate key returns null without mutating profile'
);

select ok(
  (
    select public.award_social_xp_service(
      '22222222-2222-4222-8222-222222222222',
      'challenge_award',
      'challenge:test:one',
      15
    )
  ) is not null,
  'same source key works for a different user'
);

select is(
  (
    select l.track_key
    from public.xp_ledger l
    where l.user_id = '11111111-1111-4111-8111-111111111111'
      and l.source_key = 'challenge:test:one'
    order by l.seq desc
    limit 1
  ),
  'global',
  'social awards always write global track rows'
);

select ok(
  (
    select public.award_social_xp_service(
      '11111111-1111-4111-8111-111111111111',
      'challenge_award',
      'challenge:test:one:reversal',
      -5
    )
  ) is not null,
  'negative social xp writes reversal row'
);

select is(
  (
    select l.earned_on
    from public.xp_ledger l
    where l.user_id = '22222222-2222-4222-8222-222222222222'
      and l.source_key = 'challenge:test:one'
    order by l.seq desc
    limit 1
  ),
  private.local_today_for_timezone('Pacific/Auckland'),
  'earned_on uses recipient local date'
);

select is(
  (
    select p.total_xp
    from public.xp_profiles p
    where p.user_id = '11111111-1111-4111-8111-111111111111'
      and p.track_key = 'global'
  ),
  10,
  'profile total matches net social xp'
);

reset role;
select * from finish();
rollback;
