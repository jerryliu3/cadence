create or replace function private.viewer_in_group(
  p_uid uuid,
  p_group_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.viewer_in_cohort(p_uid, p_group_id);
$$;

create or replace function private.team_in_group(
  p_team_id uuid,
  p_group_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.team_in_cohort(p_team_id, p_group_id);
$$;

create or replace function public.join_group_with_code_service(
  p_join_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.join_cohort_with_code_service(p_join_code);
exception
  when sqlstate '22023' then
    if sqlerrm = 'cohort_join_code_invalid' then
      raise exception using errcode = '22023', message = 'group_join_code_invalid';
    end if;
    raise;
end;
$$;

revoke all on function private.viewer_in_group(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.team_in_group(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.join_group_with_code_service(text)
  from public, anon;
grant execute on function public.join_group_with_code_service(text)
  to authenticated;
