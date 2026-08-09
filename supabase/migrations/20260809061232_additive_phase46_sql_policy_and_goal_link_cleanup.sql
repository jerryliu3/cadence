-- Additive Phase 46:
-- Remove unreachable RLS branches and vestigial goal-link planner locking.

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

  return new;
end;
$$;

-- goal_shares and goal_participants are insert/delete-only in active callers.
drop policy if exists goal_participants_owner_update on public.goal_participants;
drop policy if exists goal_shares_owner_update on public.goal_shares;

-- push subscription writes flow through service-role routes, not client RLS.
drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
drop policy if exists push_subscriptions_insert_self on public.push_subscriptions;
drop policy if exists push_subscriptions_update_self on public.push_subscriptions;
drop policy if exists push_subscriptions_delete_self on public.push_subscriptions;

-- coach conversation persistence is append-only through a SECURITY DEFINER RPC.
drop trigger if exists set_planner_coach_conversations_updated_at
on public.planner_coach_conversations;
drop policy if exists planner_coach_conversations_owner_update
on public.planner_coach_conversations;
drop policy if exists planner_coach_conversations_owner_delete
on public.planner_coach_conversations;
drop policy if exists planner_coach_messages_owner_update
on public.planner_coach_conversation_messages;
drop policy if exists planner_coach_messages_owner_delete
on public.planner_coach_conversation_messages;
