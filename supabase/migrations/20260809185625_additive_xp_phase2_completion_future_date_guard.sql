-- XP Phase 2:
-- Guard completions against future-dated inserts and updates.

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
      using errcode = '22023',
            message = 'future_completion_not_allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists completions_guard_future_dates
on public.completions;

create trigger completions_guard_future_dates
before insert or update of completed_on, user_id
on public.completions
for each row execute function private.guard_completion_date();
