-- Run manually after `pnpm supabase:reset`:
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/rpc_and_rls_checks.sql

begin;

-- Simulate Alice.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.role = 'authenticated';

select public.mark_goal_complete('10000000-0000-4000-8000-000000000003', current_date);
select public.mark_goal_complete('10000000-0000-4000-8000-000000000003', current_date);

do $$
declare
  count_direct integer;
begin
  select count(*) into count_direct
  from public.completions
  where goal_id = '10000000-0000-4000-8000-000000000003'
    and user_id = '11111111-1111-4111-8111-111111111111'
    and completed_on = current_date;

  if count_direct <> 1 then
    raise exception 'mark_goal_complete is not idempotent for direct completion (count=%)', count_direct;
  end if;
end;
$$;

do $$
declare
  count_cascade integer;
begin
  select count(*) into count_cascade
  from public.completions
  where goal_id = '10000000-0000-4000-8000-000000000004'
    and user_id = '11111111-1111-4111-8111-111111111111'
    and completed_on = current_date;

  if count_cascade <> 1 then
    raise exception 'linked cascade did not complete expected goal exactly once (count=%)', count_cascade;
  end if;
end;
$$;

-- RLS visibility check: Alice should not read Bob's private goal if it is not shared.
do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.goals
  where id = '10000000-0000-4000-8000-000000000009';

  if visible_count <> 0 then
    raise exception 'RLS leak: Alice can read Bob private goal';
  end if;
end;
$$;

rollback;
