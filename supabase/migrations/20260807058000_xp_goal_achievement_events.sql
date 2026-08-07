alter table public.xp_ledger
drop constraint if exists xp_ledger_event_type_check;

alter table public.xp_ledger
add constraint xp_ledger_event_type_check
check (
  event_type in (
    'award',
    'reversal',
    'goal_achievement_award',
    'goal_achievement_reversal'
  )
);

create or replace function private.goal_achievement_xp()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 100::integer;
$$;

create or replace function private.capture_completion_xp_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_goal_id uuid;
  v_completion_id uuid;
  v_completed_on date;
  v_source public.completion_source;
  v_event_type text;
  v_xp_value integer;
  v_delta integer;
  v_goal record;
  v_completion_count integer;
  v_is_achieved boolean;
  v_has_achievement_credit boolean;
begin
  if tg_op = 'INSERT' then
    v_user_id := new.user_id;
    v_goal_id := new.goal_id;
    v_completion_id := new.id;
    v_completed_on := new.completed_on;
    v_source := new.source;
    v_event_type := 'award';
  elsif tg_op = 'DELETE' then
    if pg_catalog.current_setting(
      'app.planner_deleting_profile_id',
      true
    ) = old.user_id::text then
      return old;
    end if;
    v_user_id := old.user_id;
    v_goal_id := old.goal_id;
    v_completion_id := old.id;
    v_completed_on := old.completed_on;
    v_source := old.source;
    v_event_type := 'reversal';
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_xp_value := private.xp_for_completion_source(v_source);
  v_delta := case
    when v_event_type = 'award' then v_xp_value
    else -v_xp_value
  end;

  insert into public.xp_ledger (
    user_id,
    goal_id,
    completion_id,
    completed_on,
    completion_source,
    event_type,
    xp_delta,
    metadata
  )
  values (
    v_user_id,
    v_goal_id,
    v_completion_id,
    v_completed_on,
    v_source,
    v_event_type,
    v_delta,
    pg_catalog.jsonb_build_object(
      'manualCompletionXp',
      private.manual_completion_xp(),
      'cascadeXpMultiplier',
      private.cascade_completion_xp_multiplier()
    )
  )
  on conflict (user_id, completion_id, event_type) do nothing;

  if found then
    perform private.apply_xp_delta(v_user_id, v_delta);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'resolution.xp.goal-achievement:' ||
      coalesce(v_user_id::text, '') ||
      ':' ||
      coalesce(v_goal_id::text, ''),
      9021773411
    )
  );

  select
    goal.id,
    goal.frequency_type,
    goal.target_count,
    goal.start_date,
    goal.end_date,
    goal.is_group
  into v_goal
  from public.goals goal
  where goal.id = v_goal_id
  for update;

  if v_goal.id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_goal.is_group
    or v_goal.target_count is null
    or v_goal.target_count <= 0
    or v_goal.frequency_type not in ('fixed_milestones', 'recurring') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*)
  into v_completion_count
  from public.completions completion
  where completion.user_id = v_user_id
    and completion.goal_id = v_goal_id
    and completion.completed_on >= v_goal.start_date
    and (
      v_goal.end_date is null
      or completion.completed_on <= v_goal.end_date
    );

  v_is_achieved := v_completion_count >= v_goal.target_count;

  select coalesce(sum(ledger.xp_delta), 0) > 0
  into v_has_achievement_credit
  from public.xp_ledger ledger
  where ledger.user_id = v_user_id
    and ledger.goal_id = v_goal_id
    and ledger.event_type in (
      'goal_achievement_award',
      'goal_achievement_reversal'
    );

  if v_is_achieved and not coalesce(v_has_achievement_credit, false) then
    insert into public.xp_ledger (
      user_id,
      goal_id,
      completion_id,
      completed_on,
      completion_source,
      event_type,
      xp_delta,
      metadata
    )
    values (
      v_user_id,
      v_goal_id,
      v_completion_id,
      v_completed_on,
      v_source,
      'goal_achievement_award',
      private.goal_achievement_xp(),
      pg_catalog.jsonb_build_object(
        'goalFrequencyType',
        v_goal.frequency_type,
        'targetCount',
        v_goal.target_count
      )
    )
    on conflict (user_id, completion_id, event_type) do nothing;

    if found then
      perform private.apply_xp_delta(
        v_user_id,
        private.goal_achievement_xp()
      );
    end if;
  elsif not v_is_achieved and coalesce(v_has_achievement_credit, false) then
    insert into public.xp_ledger (
      user_id,
      goal_id,
      completion_id,
      completed_on,
      completion_source,
      event_type,
      xp_delta,
      metadata
    )
    values (
      v_user_id,
      v_goal_id,
      v_completion_id,
      v_completed_on,
      v_source,
      'goal_achievement_reversal',
      -private.goal_achievement_xp(),
      pg_catalog.jsonb_build_object(
        'goalFrequencyType',
        v_goal.frequency_type,
        'targetCount',
        v_goal.target_count
      )
    )
    on conflict (user_id, completion_id, event_type) do nothing;

    if found then
      perform private.apply_xp_delta(
        v_user_id,
        -private.goal_achievement_xp()
      );
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function private.goal_achievement_xp()
from public, anon, authenticated;
