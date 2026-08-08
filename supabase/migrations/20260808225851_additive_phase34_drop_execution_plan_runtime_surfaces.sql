-- Additive Phase 34:
-- Remove legacy execution-plan/planner-state runtime surfaces after planner_items cutover.

create or replace function private.validate_goal_link_for_planner()
returns trigger
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
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception using
      errcode = '23514',
      message = 'goal link owner is immutable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(new.owner_id)
  );

  perform id
  from public.goals
  where id in (new.source_goal_id, new.target_goal_id)
  order by id
  for key share;

  select owner_id, is_group
  into v_source_owner, v_source_group
  from public.goals
  where id = new.source_goal_id;

  select owner_id, is_group
  into v_target_owner, v_target_group
  from public.goals
  where id = new.target_goal_id;

  if v_source_owner is null or v_target_owner is null then
    raise exception using
      errcode = '23503',
      message = 'both goals must exist for linking';
  end if;

  if v_source_owner <> new.owner_id or v_target_owner <> new.owner_id then
    raise exception using
      errcode = '23514',
      message = 'goal links may only connect goals owned by the link owner';
  end if;

  if v_source_group or v_target_group then
    raise exception using
      errcode = '23514',
      message = 'group goals cannot participate in personal goal links';
  end if;

  if exists (
    select 1
    from public.planner_items item
    where item.owner_id = new.owner_id
      and item.locked
      and item.goal_id in (new.source_goal_id, new.target_goal_id)
  ) then
    raise exception using
      errcode = '55000',
      message = 'goals with published planner items cannot be linked';
  end if;

  return new;
end;
$$;

drop trigger if exists initialize_planner_state on public.profiles;
drop trigger if exists mark_profile_planner_deletion on public.profiles;
drop trigger if exists profiles_planner_preferences_canonical_revision on public.profiles;
drop trigger if exists goals_planner_canonical_revision on public.goals;
drop trigger if exists goals_planner_canonical_revision_before_delete on public.goals;
drop trigger if exists completions_planner_canonical_revision on public.completions;
drop trigger if exists goal_links_planner_canonical_revision on public.goal_links;

drop function if exists public.get_planner_state();
drop function if exists public.dismiss_execution_plan_service(uuid, uuid, bigint, bigint);
drop function if exists public.set_execution_plan_item_lock_service(
  uuid,
  uuid,
  boolean,
  bigint,
  bigint,
  bigint
);
drop function if exists public.publish_execution_plan_service(
  uuid,
  date,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  uuid,
  text,
  bigint,
  bigint,
  uuid,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb
);

drop function if exists private.bump_canonical_for_completion();
drop function if exists private.bump_canonical_for_goal();
drop function if exists private.bump_canonical_for_goal_link();
drop function if exists private.bump_canonical_for_profile_preferences();
drop function if exists private.bump_planner_canonical_revision(uuid);
drop function if exists private.bump_planner_execution_revision(uuid);
drop function if exists private.ensure_planner_state(uuid);
drop function if exists private.require_planner_state_revisions(uuid, bigint, bigint);
drop function if exists private.initialize_planner_state_for_profile();
drop function if exists private.mark_profile_planner_deletion();

drop table if exists public.execution_plan_issues;
drop table if exists public.execution_plan_items;
drop table if exists public.execution_plan_days;
drop table if exists public.execution_plan_goals;
drop table if exists public.execution_plans;
drop table if exists private.planner_state;

drop function if exists private.guard_immutable_execution_snapshot();
drop function if exists private.derive_execution_plan_goal_identity();
drop function if exists private.enforce_cross_plan_goal_date_conflict();
drop function if exists private.enforce_cross_plan_goal_unit_conflict();
drop function if exists private.guard_execution_plan();
drop function if exists private.guard_execution_plan_goal();
drop function if exists private.guard_execution_plan_item();
drop function if exists private.supersede_elapsed_active_execution_plans();
drop function if exists private.validate_execution_plan();
