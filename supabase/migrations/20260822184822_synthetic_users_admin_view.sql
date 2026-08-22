create or replace view public.admin_synthetic_users
with (security_invoker = true) as
select
  synthetic.user_id,
  profile.username,
  profile.display_name,
  profile.social_activity_visible,
  synthetic.persona,
  synthetic.archetype,
  synthetic.daily_budget,
  synthetic.completions_today,
  synthetic.last_active_date,
  synthetic.enabled,
  coalesce(goal_counts.goal_count, 0) as goal_count,
  synthetic.created_at,
  synthetic.updated_at
from public.synthetic_users synthetic
join public.profiles profile
  on profile.id = synthetic.user_id
left join (
  select
    goal.owner_id,
    count(*)::integer as goal_count
  from public.goals goal
  where goal.is_deleted = false
  group by goal.owner_id
) goal_counts
  on goal_counts.owner_id = synthetic.user_id;

comment on view public.admin_synthetic_users is
  'Admin roster of synthetic users. UPDATE mutates main fields; DELETE disables the user.';

create or replace function private.admin_synthetic_users_instead_of_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_username text;
  v_display_name text;
  v_archetype text;
begin
  if new.user_id is distinct from old.user_id then
    raise exception
      using errcode = '22023',
            message = 'admin_synthetic_user_id_immutable';
  end if;

  v_username := lower(btrim(coalesce(new.username, '')));
  if char_length(v_username) < 3
     or char_length(v_username) > 32
     or v_username !~ '^[a-z0-9_]+$' then
    raise exception
      using errcode = '22023',
            message = 'admin_synthetic_username_invalid';
  end if;

  v_display_name := nullif(btrim(coalesce(new.display_name, '')), '');
  v_archetype := nullif(btrim(coalesce(new.archetype, '')), '');
  if v_archetype is null or char_length(v_archetype) > 64 then
    raise exception
      using errcode = '22023',
            message = 'admin_synthetic_archetype_invalid';
  end if;

  update public.synthetic_users synthetic
  set
    persona = new.persona,
    archetype = v_archetype,
    daily_budget = new.daily_budget,
    enabled = new.enabled,
    updated_at = pg_catalog.now()
  where synthetic.user_id = old.user_id;

  update public.profiles profile
  set
    username = v_username,
    display_name = v_display_name,
    social_activity_visible = new.social_activity_visible
  where profile.id = old.user_id;

  return new;
end;
$$;

create or replace function private.admin_synthetic_users_instead_of_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.synthetic_users synthetic
  set
    enabled = false,
    updated_at = pg_catalog.now()
  where synthetic.user_id = old.user_id;

  return old;
end;
$$;

drop trigger if exists admin_synthetic_users_instead_of_update
  on public.admin_synthetic_users;
create trigger admin_synthetic_users_instead_of_update
instead of update on public.admin_synthetic_users
for each row
execute function private.admin_synthetic_users_instead_of_update();

drop trigger if exists admin_synthetic_users_instead_of_delete
  on public.admin_synthetic_users;
create trigger admin_synthetic_users_instead_of_delete
instead of delete on public.admin_synthetic_users
for each row
execute function private.admin_synthetic_users_instead_of_delete();

revoke all on function private.admin_synthetic_users_instead_of_update()
  from public, anon, authenticated;
revoke all on function private.admin_synthetic_users_instead_of_delete()
  from public, anon, authenticated;
grant execute on function private.admin_synthetic_users_instead_of_update()
  to service_role;
grant execute on function private.admin_synthetic_users_instead_of_delete()
  to service_role;

revoke all on table public.admin_synthetic_users from public, anon, authenticated;
grant select, update, delete on table public.admin_synthetic_users to service_role;
