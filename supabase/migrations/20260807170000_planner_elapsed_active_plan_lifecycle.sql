create or replace function private.supersede_elapsed_active_execution_plans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_scope_month date;
begin
  if new.status <> 'active' then
    return new;
  end if;

  v_current_scope_month := date_trunc(
    'month',
    private.local_today_for_timezone(new.timezone)
  )::date;

  update public.execution_plans
  set status = 'superseded',
      superseded_at = coalesce(superseded_at, pg_catalog.now())
  where owner_id = new.owner_id
    and status = 'active'
    and scope_month < v_current_scope_month
    and id <> new.id;

  return new;
end;
$$;

drop trigger if exists supersede_elapsed_active_execution_plans_on_insert
on public.execution_plans;

create trigger supersede_elapsed_active_execution_plans_on_insert
before insert on public.execution_plans
for each row
execute function private.supersede_elapsed_active_execution_plans();
