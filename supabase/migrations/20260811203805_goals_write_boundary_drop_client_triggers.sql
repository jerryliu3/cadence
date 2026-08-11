-- Goals write boundary:
-- Move client PostgREST mutations behind SECURITY DEFINER RPCs (completions pattern),
-- then drop the 5 non-stamp client-facing triggers.
-- Keep set_goals_updated_at, on_auth_user_created, profiles_xp_initialize,
-- and xp_levels_assert_monotonic.
--
-- No authenticated hard-delete path exists after this cutover (soft_delete_goal only).
-- goals_xp_reverse_on_delete is intentionally dropped: profile CASCADE deletes already
-- skipped reversal via xp_skip_for_profile_delete, and service-role raw deletes remain
-- out of product write paths.

create or replace function private.normalize_goal_category_pair(
  p_category text,
  p_category_key text
)
returns table (
  category text,
  category_key text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_category text;
begin
  v_key := private.normalize_goal_category_key(
    coalesce(p_category_key, p_category)
  );

  if v_key = 'other' then
    v_category := coalesce(
      nullif(btrim(coalesce(p_category, '')), ''),
      private.goal_category_label('other')
    );
  else
    v_category := private.goal_category_label(v_key);
  end if;

  category := v_category;
  category_key := v_key;
  return next;
end;
$$;

create or replace function private.recompute_xp_for_goal_users(
  p_goal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct c.user_id
    from public.completions c
    where c.goal_id = p_goal_id
  loop
    if private.xp_skip_for_profile_delete(r.user_id) then
      continue;
    end if;

    perform public.recompute_goal_xp_service(r.user_id, p_goal_id);
  end loop;
end;
$$;

create or replace function private.assert_goal_owner(
  p_goal_id uuid,
  p_uid uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.goals g
    where g.id = p_goal_id
      and g.owner_id = p_uid
  ) then
    raise exception using
      errcode = '42501',
      message = 'not authorized for goal';
  end if;
end;
$$;

-- INSERT-only helper. Owner-immutability-on-UPDATE from the old trigger is not
-- reproduced because no authenticated UPDATE path to goal_links remains after cutover.
create or replace function private.insert_goal_link_validated(
  p_owner_id uuid,
  p_source_goal_id uuid,
  p_target_goal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_owner uuid;
  v_target_owner uuid;
  v_source_group boolean;
  v_target_group boolean;
begin
  if p_source_goal_id = p_target_goal_id then
    raise exception using
      errcode = '23514',
      message = 'goal link source and target must differ';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(p_owner_id)
  );

  perform id
  from public.goals
  where id in (p_source_goal_id, p_target_goal_id)
  order by id
  for key share;

  select owner_id, is_group
  into v_source_owner, v_source_group
  from public.goals
  where id = p_source_goal_id;

  select owner_id, is_group
  into v_target_owner, v_target_group
  from public.goals
  where id = p_target_goal_id;

  if v_source_owner is null or v_target_owner is null then
    raise exception using
      errcode = '23503',
      message = 'both goals must exist for linking';
  end if;

  if v_source_owner <> p_owner_id or v_target_owner <> p_owner_id then
    raise exception using
      errcode = '23514',
      message = 'goal links may only connect goals owned by the link owner';
  end if;

  if v_source_group or v_target_group then
    raise exception using
      errcode = '23514',
      message = 'group goals cannot participate in personal goal links';
  end if;

  insert into public.goal_links (
    owner_id,
    source_goal_id,
    target_goal_id
  )
  values (
    p_owner_id,
    p_source_goal_id,
    p_target_goal_id
  );
end;
$$;

create or replace function public.create_goal(
  p_id uuid,
  p_title text,
  p_description text default null,
  p_reward_text text default null,
  p_category text default 'general',
  p_category_key text default null,
  p_color text default null,
  p_frequency_type public.goal_frequency_type default 'recurring',
  p_recurrence_interval public.recurrence_interval default null,
  p_target_count integer default null,
  p_milestone_names text[] default null,
  p_start_date date default current_date,
  p_end_date date default null,
  p_default_local_time text default null,
  p_is_group boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_category text;
  v_category_key text;
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  select n.category, n.category_key
  into v_category, v_category_key
  from private.normalize_goal_category_pair(p_category, p_category_key) n;

  insert into public.goals (
    id,
    owner_id,
    title,
    description,
    reward_text,
    category,
    category_key,
    color,
    frequency_type,
    recurrence_interval,
    target_count,
    milestone_names,
    start_date,
    end_date,
    default_local_time,
    is_group,
    is_deleted
  )
  values (
    v_id,
    v_uid,
    p_title,
    p_description,
    p_reward_text,
    v_category,
    v_category_key,
    p_color,
    p_frequency_type,
    p_recurrence_interval,
    p_target_count,
    p_milestone_names,
    p_start_date,
    p_end_date,
    p_default_local_time,
    coalesce(p_is_group, false),
    false
  );

  -- Group goals always get an owner participant row (create_group_goal and
  -- goal-form is_group paths share create_goal).
  if coalesce(p_is_group, false) then
    insert into public.goal_participants (
      goal_id,
      user_id,
      role
    )
    values (
      v_id,
      v_uid,
      'owner'::public.participant_role
    )
    on conflict (goal_id, user_id) do nothing;
  end if;

  return v_id;
end;
$$;

create or replace function public.update_goal(
  p_id uuid,
  p_title text,
  p_description text default null,
  p_reward_text text default null,
  p_category text default 'general',
  p_category_key text default null,
  p_color text default null,
  p_frequency_type public.goal_frequency_type default 'recurring',
  p_recurrence_interval public.recurrence_interval default null,
  p_target_count integer default null,
  p_milestone_names text[] default null,
  p_start_date date default current_date,
  p_end_date date default null,
  p_default_local_time text default null,
  p_is_group boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.goals%rowtype;
  v_category text;
  v_category_key text;
  v_needs_xp boolean := false;
begin
  perform private.assert_goal_owner(p_id, v_uid);

  select *
  into v_old
  from public.goals
  where id = p_id
  for update;

  select n.category, n.category_key
  into v_category, v_category_key
  from private.normalize_goal_category_pair(p_category, p_category_key) n;

  -- Match former goals_xp_recompute column filter (owner_id is immutable here).
  v_needs_xp :=
    v_old.target_count is distinct from p_target_count
    or v_old.start_date is distinct from p_start_date
    or v_old.end_date is distinct from p_end_date
    or v_old.frequency_type is distinct from p_frequency_type
    or v_old.recurrence_interval is distinct from p_recurrence_interval
    or v_old.category_key is distinct from v_category_key;

  update public.goals
  set
    title = p_title,
    description = p_description,
    reward_text = p_reward_text,
    category = v_category,
    category_key = v_category_key,
    color = p_color,
    frequency_type = p_frequency_type,
    recurrence_interval = p_recurrence_interval,
    target_count = p_target_count,
    milestone_names = p_milestone_names,
    start_date = p_start_date,
    end_date = p_end_date,
    default_local_time = p_default_local_time,
    is_group = coalesce(p_is_group, false)
  where id = p_id
    and owner_id = v_uid;

  if v_needs_xp then
    perform private.recompute_xp_for_goal_users(p_id);
  end if;
end;
$$;

create or replace function public.create_goals(
  p_goals jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_id uuid;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if p_goals is null or jsonb_typeof(p_goals) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_goals must be a json array';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_goals)
  loop
    v_id := public.create_goal(
      coalesce((v_item->>'id')::uuid, gen_random_uuid()),
      v_item->>'title',
      nullif(v_item->>'description', ''),
      nullif(v_item->>'reward_text', ''),
      coalesce(v_item->>'category', 'general'),
      nullif(v_item->>'category_key', ''),
      nullif(v_item->>'color', ''),
      coalesce(
        (v_item->>'frequency_type')::public.goal_frequency_type,
        'recurring'::public.goal_frequency_type
      ),
      nullif(v_item->>'recurrence_interval', '')::public.recurrence_interval,
      nullif(v_item->>'target_count', '')::integer,
      case
        when v_item ? 'milestone_names'
          and jsonb_typeof(v_item->'milestone_names') = 'array'
        then array(
          select jsonb_array_elements_text(v_item->'milestone_names')
        )
        else null
      end,
      coalesce((v_item->>'start_date')::date, current_date),
      nullif(v_item->>'end_date', '')::date,
      nullif(v_item->>'default_local_time', ''),
      coalesce((v_item->>'is_group')::boolean, false)
    );
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$$;

create or replace function public.set_goal_photo_path(
  p_goal_id uuid,
  p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  perform private.assert_goal_owner(p_goal_id, v_uid);

  update public.goals
  set photo_path = p_photo_path
  where id = p_goal_id
    and owner_id = v_uid;
end;
$$;

create or replace function public.set_goal_archived(
  p_goal_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old_archived timestamptz;
  v_new_archived timestamptz;
begin
  perform private.assert_goal_owner(p_goal_id, v_uid);

  select archived_at
  into v_old_archived
  from public.goals
  where id = p_goal_id
  for update;

  v_new_archived := case
    when coalesce(p_archived, false) then coalesce(v_old_archived, pg_catalog.now())
    else null
  end;

  update public.goals
  set archived_at = v_new_archived
  where id = p_goal_id
    and owner_id = v_uid;

  if v_old_archived is distinct from v_new_archived then
    perform private.recompute_xp_for_goal_users(p_goal_id);
  end if;
end;
$$;

create or replace function public.soft_delete_goal(
  p_goal_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_was_deleted boolean;
begin
  perform private.assert_goal_owner(p_goal_id, v_uid);

  select is_deleted
  into v_was_deleted
  from public.goals
  where id = p_goal_id
  for update;

  update public.goals
  set is_deleted = true
  where id = p_goal_id
    and owner_id = v_uid;

  if not coalesce(v_was_deleted, false) then
    perform private.recompute_xp_for_goal_users(p_goal_id);
  end if;
end;
$$;

create or replace function public.set_goal_milestone_names(
  p_goal_id uuid,
  p_milestone_names text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  perform private.assert_goal_owner(p_goal_id, v_uid);

  update public.goals
  set milestone_names = p_milestone_names
  where id = p_goal_id
    and owner_id = v_uid;
end;
$$;

create or replace function public.replace_goal_source_link(
  p_source_goal_id uuid,
  p_target_goal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  perform private.assert_goal_owner(p_source_goal_id, v_uid);

  delete from public.goal_links
  where owner_id = v_uid
    and source_goal_id = p_source_goal_id;

  if p_target_goal_id is not null then
    perform private.insert_goal_link_validated(
      v_uid,
      p_source_goal_id,
      p_target_goal_id
    );
  end if;
end;
$$;

create or replace function public.create_goal_links(
  p_links jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_source uuid;
  v_target uuid;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_links must be a json array';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_links)
  loop
    v_source := (v_item->>'source_goal_id')::uuid;
    v_target := (v_item->>'target_goal_id')::uuid;
    perform private.assert_goal_owner(v_source, v_uid);
    perform private.insert_goal_link_validated(v_uid, v_source, v_target);
  end loop;
end;
$$;

create or replace function public.create_group_goal(
  p_id uuid,
  p_title text,
  p_description text default null,
  p_category text default 'general',
  p_category_key text default null,
  p_color text default '#0ea5e9',
  p_frequency_type public.goal_frequency_type default 'recurring',
  p_recurrence_interval public.recurrence_interval default null,
  p_target_count integer default null,
  p_start_date date default current_date,
  p_end_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  v_id := public.create_goal(
    p_id,
    p_title,
    p_description,
    null,
    p_category,
    p_category_key,
    p_color,
    p_frequency_type,
    p_recurrence_interval,
    p_target_count,
    null,
    p_start_date,
    p_end_date,
    null,
    true
  );

  -- Owner participant row is inserted by create_goal when p_is_group is true.
  return v_id;
end;
$$;

create or replace function public.add_goal_participant(
  p_goal_id uuid,
  p_user_id uuid,
  p_role public.participant_role default 'participant'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_is_group boolean;
  v_role public.participant_role := coalesce(p_role, 'participant'::public.participant_role);
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if not public.can_administer_goal(p_goal_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not authorized for goal';
  end if;

  select owner_id, is_group
  into v_owner, v_is_group
  from public.goals
  where id = p_goal_id;

  if v_role = 'owner' and p_user_id <> v_owner then
    raise exception using
      errcode = '23514',
      message = 'owner role must match the goal owner';
  end if;

  if v_role = 'participant' and not coalesce(v_is_group, false) then
    raise exception using
      errcode = '23514',
      message = 'only group goals may have participant members';
  end if;

  insert into public.goal_participants (
    goal_id,
    user_id,
    role
  )
  values (
    p_goal_id,
    p_user_id,
    v_role
  );
end;
$$;

create or replace function public.remove_goal_participant(
  p_goal_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if v_uid <> p_user_id and not public.can_administer_goal(p_goal_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not authorized for goal';
  end if;

  delete from public.goal_participants
  where goal_id = p_goal_id
    and user_id = p_user_id;
end;
$$;

-- Grants
revoke all on function private.normalize_goal_category_pair(text, text)
from public, anon, authenticated;
revoke all on function private.recompute_xp_for_goal_users(uuid)
from public, anon, authenticated;
revoke all on function private.assert_goal_owner(uuid, uuid)
from public, anon, authenticated;
revoke all on function private.insert_goal_link_validated(uuid, uuid, uuid)
from public, anon, authenticated;

revoke all on function public.create_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, boolean
) from public, anon;
grant execute on function public.create_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, boolean
) to authenticated;

revoke all on function public.update_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, boolean
) from public, anon;
grant execute on function public.update_goal(
  uuid, text, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, text[], date, date, text, boolean
) to authenticated;

revoke all on function public.create_goals(jsonb) from public, anon;
grant execute on function public.create_goals(jsonb) to authenticated;

revoke all on function public.set_goal_photo_path(uuid, text) from public, anon;
grant execute on function public.set_goal_photo_path(uuid, text) to authenticated;

revoke all on function public.set_goal_archived(uuid, boolean) from public, anon;
grant execute on function public.set_goal_archived(uuid, boolean) to authenticated;

revoke all on function public.soft_delete_goal(uuid) from public, anon;
grant execute on function public.soft_delete_goal(uuid) to authenticated;

revoke all on function public.set_goal_milestone_names(uuid, text[]) from public, anon;
grant execute on function public.set_goal_milestone_names(uuid, text[]) to authenticated;

revoke all on function public.replace_goal_source_link(uuid, uuid) from public, anon;
grant execute on function public.replace_goal_source_link(uuid, uuid) to authenticated;

revoke all on function public.create_goal_links(jsonb) from public, anon;
grant execute on function public.create_goal_links(jsonb) to authenticated;

revoke all on function public.create_group_goal(
  uuid, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, date, date
) from public, anon;
grant execute on function public.create_group_goal(
  uuid, text, text, text, text, text,
  public.goal_frequency_type, public.recurrence_interval,
  integer, date, date
) to authenticated;

revoke all on function public.add_goal_participant(
  uuid, uuid, public.participant_role
) from public, anon;
grant execute on function public.add_goal_participant(
  uuid, uuid, public.participant_role
) to authenticated;

revoke all on function public.remove_goal_participant(uuid, uuid)
from public, anon;
grant execute on function public.remove_goal_participant(uuid, uuid)
to authenticated;

-- Drop authenticated write policies (keep SELECT). Completions-style cutover.
drop policy if exists goals_insert_owner_only on public.goals;
drop policy if exists goals_update_owner_only on public.goals;
drop policy if exists goals_delete_owner_only on public.goals;

drop policy if exists goal_links_owner_all on public.goal_links;
drop policy if exists goal_links_owner_select on public.goal_links;
create policy goal_links_owner_select
on public.goal_links
for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists goal_participants_owner_insert on public.goal_participants;
drop policy if exists goal_participants_owner_update on public.goal_participants;
drop policy if exists goal_participants_delete_owner on public.goal_participants;
drop policy if exists goal_participants_leave_group on public.goal_participants;

-- Drop the 5 client-PostgREST triggers (keep set_goals_updated_at).
drop trigger if exists validate_goal_link on public.goal_links;
drop trigger if exists validate_goal_participant on public.goal_participants;
drop trigger if exists goals_set_category_key on public.goals;
drop trigger if exists goals_xp_recompute on public.goals;
drop trigger if exists goals_xp_reverse_on_delete on public.goals;

drop function if exists private.set_goal_category_key();
drop function if exists private.sync_goal_xp_from_goal_update();
drop function if exists private.reverse_goal_xp_before_delete();
drop function if exists private.validate_goal_link_for_planner();
drop function if exists public.validate_goal_participant();
