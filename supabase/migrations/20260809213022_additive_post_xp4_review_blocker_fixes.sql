-- Post-XP4 blocker fixes:
-- - keep goals.category_key derived from category on every write
-- - align completion future-date SQLSTATE with planner boundary guards
-- - serialize duo activation checks across both users to avoid double-active races

drop trigger if exists goals_set_category_key
on public.goals;

create trigger goals_set_category_key
before insert or update
on public.goals
for each row execute function private.set_goal_category_key();

create or replace function private.guard_completion_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_today date;
begin
  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = new.user_id;

  v_local_today := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  if new.completed_on > v_local_today then
    raise exception
      using errcode = '23514',
            message = 'future_completion_not_allowed';
  end if;

  return new;
end;
$$;

create or replace function private.ensure_single_active_duo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lock_user_a uuid := least(new.user_a_id, new.user_b_id);
  v_lock_user_b uuid := greatest(new.user_a_id, new.user_b_id);
  v_lock_key_a bigint;
  v_lock_key_b bigint;
begin
  if new.status <> 'active'::public.duo_status then
    return new;
  end if;

  v_lock_key_a := pg_catalog.hashtextextended(
    'resolution.duo.user:' || v_lock_user_a::text,
    0
  );
  v_lock_key_b := pg_catalog.hashtextextended(
    'resolution.duo.user:' || v_lock_user_b::text,
    0
  );

  perform pg_catalog.pg_advisory_xact_lock(v_lock_key_a);
  if v_lock_key_b <> v_lock_key_a then
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key_b);
  end if;

  if exists (
    select 1
    from public.duos duo
    where duo.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and duo.status = 'active'::public.duo_status
      and (new.user_a_id in (duo.user_a_id, duo.user_b_id)
        or new.user_b_id in (duo.user_a_id, duo.user_b_id))
  ) then
    raise exception using errcode = '23514', message = 'duo_already_active';
  end if;

  return new;
end;
$$;
