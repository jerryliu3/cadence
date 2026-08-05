create or replace function private.local_today_for_timezone(
  p_timezone text
)
returns date
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if not private.is_valid_planner_timezone(p_timezone) then
    raise exception using
      errcode = '22023',
      message = 'invalid planner timezone';
  end if;
  return (clock_timestamp() at time zone p_timezone)::date;
end;
$$;
