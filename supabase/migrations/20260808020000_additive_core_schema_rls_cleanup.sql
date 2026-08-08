-- Additive Phase 2:
-- Core schema cleanup without rewriting migration history.
-- - tighten profile visibility
-- - dedupe repeated owner policies with can_administer_goal
-- - unify goal_links policies
-- - move push ownership FKs to public.profiles
-- - standardize updated_at triggers on push tables

-- Profiles now include planner preference state, so restrict broad reads.
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_select_self_or_related on public.profiles;
create policy profiles_select_self_or_related
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.goals goal
    where goal.owner_id = profiles.id
      and public.can_view_goal(goal.id, (select auth.uid()))
  )
  or exists (
    select 1
    from public.goal_participants participant
    where participant.user_id = profiles.id
      and exists (
        select 1
        from public.goals goal
        where goal.id = participant.goal_id
          and goal.owner_id = (select auth.uid())
      )
  )
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create or replace function public.find_profile_by_username(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if v_query = '' then
    return;
  end if;

  return query
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_url,
    profile.created_at
  from public.profiles profile
  where profile.id <> v_uid
    and profile.username ilike ('%' || v_query || '%')
  order by profile.username asc
  limit v_limit;
end;
$$;

create or replace function public.username_is_available(
  p_username text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
begin
  if char_length(v_username) < 3 or char_length(v_username) > 32 then
    return false;
  end if;

  if v_username !~ '^[a-z0-9_]+$' then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles profile
    where profile.username = v_username
  );
end;
$$;

grant execute on function public.find_profile_by_username(text, integer) to authenticated;
grant execute on function public.username_is_available(text) to anon;
grant execute on function public.username_is_available(text) to authenticated;

create or replace function public.can_administer_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.goals g
    where g.id = p_goal_id
      and g.owner_id = p_uid
  );
$$;

-- Keep goal owner write boundaries explicit and standardized.
drop policy if exists goals_insert_owner_only on public.goals;
create policy goals_insert_owner_only
on public.goals
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists goals_update_owner_only on public.goals;
create policy goals_update_owner_only
on public.goals
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists goals_delete_owner_only on public.goals;
create policy goals_delete_owner_only
on public.goals
for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Collapse byte-identical goal_links owner policies into one FOR ALL policy.
drop policy if exists goal_links_owner_select on public.goal_links;
drop policy if exists goal_links_owner_insert on public.goal_links;
drop policy if exists goal_links_owner_update on public.goal_links;
drop policy if exists goal_links_owner_delete on public.goal_links;
drop policy if exists goal_links_owner_all on public.goal_links;
create policy goal_links_owner_all
on public.goal_links
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Replace repeated owner EXISTS checks with can_administer_goal().
drop policy if exists goal_participants_select_related on public.goal_participants;
create policy goal_participants_select_related
on public.goal_participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_administer_goal(goal_id, (select auth.uid()))
);

drop policy if exists goal_participants_owner_insert on public.goal_participants;
create policy goal_participants_owner_insert
on public.goal_participants
for insert
to authenticated
with check (public.can_administer_goal(goal_id, (select auth.uid())));

drop policy if exists goal_participants_owner_update on public.goal_participants;
create policy goal_participants_owner_update
on public.goal_participants
for update
to authenticated
using (public.can_administer_goal(goal_id, (select auth.uid())))
with check (public.can_administer_goal(goal_id, (select auth.uid())));

drop policy if exists goal_participants_delete_owner on public.goal_participants;
create policy goal_participants_delete_owner
on public.goal_participants
for delete
to authenticated
using (public.can_administer_goal(goal_id, (select auth.uid())));

drop policy if exists goal_participants_leave_group on public.goal_participants;
create policy goal_participants_leave_group
on public.goal_participants
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists goal_shares_select_related on public.goal_shares;
create policy goal_shares_select_related
on public.goal_shares
for select
to authenticated
using (
  shared_with = (select auth.uid())
  or public.can_administer_goal(goal_id, (select auth.uid()))
);

drop policy if exists goal_shares_owner_insert on public.goal_shares;
create policy goal_shares_owner_insert
on public.goal_shares
for insert
to authenticated
with check (public.can_administer_goal(goal_id, (select auth.uid())));

drop policy if exists goal_shares_owner_update on public.goal_shares;
create policy goal_shares_owner_update
on public.goal_shares
for update
to authenticated
using (public.can_administer_goal(goal_id, (select auth.uid())))
with check (public.can_administer_goal(goal_id, (select auth.uid())));

drop policy if exists goal_shares_owner_delete on public.goal_shares;
create policy goal_shares_owner_delete
on public.goal_shares
for delete
to authenticated
using (public.can_administer_goal(goal_id, (select auth.uid())));

-- Align push ownership references with public.profiles.
alter table public.push_subscriptions
drop constraint if exists push_subscriptions_user_id_fkey;
alter table public.push_subscriptions
add constraint push_subscriptions_user_id_fkey
foreign key (user_id)
references public.profiles(id)
on delete cascade;

alter table public.notification_schedules
drop constraint if exists notification_schedules_user_id_fkey;
alter table public.notification_schedules
add constraint notification_schedules_user_id_fkey
foreign key (user_id)
references public.profiles(id)
on delete cascade;

drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
create policy push_subscriptions_select_self
on public.push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert_self on public.push_subscriptions;
create policy push_subscriptions_insert_self
on public.push_subscriptions
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update_self on public.push_subscriptions;
create policy push_subscriptions_update_self
on public.push_subscriptions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete_self on public.push_subscriptions;
create policy push_subscriptions_delete_self
on public.push_subscriptions
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notification_schedules_select_self on public.notification_schedules;
create policy notification_schedules_select_self
on public.notification_schedules
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notification_schedules_insert_self on public.notification_schedules;
create policy notification_schedules_insert_self
on public.notification_schedules
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists notification_schedules_update_self on public.notification_schedules;
create policy notification_schedules_update_self
on public.notification_schedules
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists notification_schedules_delete_self on public.notification_schedules;
create policy notification_schedules_delete_self
on public.notification_schedules
for delete
to authenticated
using (user_id = (select auth.uid()));

drop trigger if exists set_push_subscriptions_updated_at
on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_schedules_updated_at
on public.notification_schedules;
create trigger set_notification_schedules_updated_at
before update on public.notification_schedules
for each row execute function public.set_updated_at();
