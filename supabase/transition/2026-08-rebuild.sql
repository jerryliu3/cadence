-- Additive one-off transition script for backend simplification.
--
-- This script is intended to run on hosted legacy data only after additive
-- cutover migrations are applied and runtime writes have moved to the new
-- surfaces (planner_items + public coach persistence). Running this before
-- runtime cutover can make migrated rows stale on the next planner/coach write.
--
-- Required schema preconditions:
--   - profiles preference columns
--   - planner_items
--   - public coach persistence tables
--
-- It performs data migration and assertions only.
-- It does not alter migration history and does not drop legacy tables.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '0';

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'transition precondition failed: public.profiles is missing';
  end if;
  if to_regclass('public.planner_preferences') is null then
    raise exception 'transition precondition failed: public.planner_preferences is missing';
  end if;
  if to_regclass('public.execution_plans') is null
    or to_regclass('public.execution_plan_goals') is null
    or to_regclass('public.execution_plan_items') is null then
    raise exception 'transition precondition failed: legacy execution plan tables are missing';
  end if;
  if to_regclass('public.planner_items') is null then
    raise exception 'transition precondition failed: public.planner_items is missing';
  end if;
  if to_regclass('public.planner_coach_conversations') is null
    or to_regclass('public.planner_coach_conversation_messages') is null then
    raise exception 'transition precondition failed: public coach tables are missing';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'timezone'
  ) then
    raise exception 'transition precondition failed: public.profiles.timezone is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'timezone_confirmed_at'
  ) then
    raise exception 'transition precondition failed: public.profiles.timezone_confirmed_at is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'week_starts_on'
  ) then
    raise exception 'transition precondition failed: public.profiles.week_starts_on is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'rest_weekdays'
  ) then
    raise exception 'transition precondition failed: public.profiles.rest_weekdays is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'blackout_ranges'
  ) then
    raise exception 'transition precondition failed: public.profiles.blackout_ranges is missing';
  end if;
end;
$$;

-- 1) Strict planner_preferences -> profiles mapping.
do $$
declare
  v_pref_count bigint := 0;
  v_join_count bigint := 0;
begin
  if exists (
    select 1
    from public.planner_preferences pref
    where not exists (
      select 1 from public.profiles p where p.id = pref.owner_id
    )
  ) then
    raise exception
      'transition invariant failed: planner_preferences has owner without profile row';
  end if;

  if exists (
    select 1
    from public.planner_preferences pref
    where not exists (
      select 1
      from pg_catalog.pg_timezone_names tz
      where tz.name = pref.timezone
    )
  ) then
    raise exception
      'transition invariant failed: planner_preferences contains invalid timezone values';
  end if;

  if exists (
    select 1
    from public.planner_preferences pref
    where pref.default_policy ? 'weekStartsOn'
      and coalesce(pref.default_policy->>'weekStartsOn', '') !~ '^[0-6]$'
  ) then
    raise exception
      'transition invariant failed: default_policy.weekStartsOn must be 0..6';
  end if;

  if exists (
    select 1
    from public.planner_preferences pref
    where pref.default_policy ? 'restWeekdays'
      and jsonb_typeof(pref.default_policy->'restWeekdays') <> 'array'
  ) then
    raise exception
      'transition invariant failed: default_policy.restWeekdays must be an array';
  end if;

  if exists (
    select 1
    from public.planner_preferences pref
    cross join lateral jsonb_array_elements_text(
      coalesce(pref.default_policy->'restWeekdays', '[]'::jsonb)
    ) as rest(value)
    where rest.value !~ '^[0-9]+$'
      or rest.value::int < 0
      or rest.value::int > 6
  ) then
    raise exception
      'transition invariant failed: default_policy.restWeekdays entries must be 0..6';
  end if;

  if exists (
    select 1
    from public.planner_preferences pref
    where pref.default_policy ? 'blackoutRanges'
      and jsonb_typeof(pref.default_policy->'blackoutRanges') <> 'array'
  ) then
    raise exception
      'transition invariant failed: default_policy.blackoutRanges must be an array';
  end if;

  update public.profiles p
  set
    timezone = pref.timezone,
    timezone_confirmed_at = pref.timezone_confirmed_at,
    week_starts_on = coalesce(
      case
        when coalesce(pref.default_policy->>'weekStartsOn', '') ~ '^[0-6]$'
          then (pref.default_policy->>'weekStartsOn')::smallint
        else null
      end,
      1
    ),
    rest_weekdays = coalesce(
      (
        select array_agg(day_item.value::smallint order by day_item.ordinality)
        from jsonb_array_elements_text(
          coalesce(pref.default_policy->'restWeekdays', '[]'::jsonb)
        ) with ordinality as day_item(value, ordinality)
      ),
      '{}'::smallint[]
    ),
    blackout_ranges = coalesce(
      case
        when jsonb_typeof(pref.default_policy->'blackoutRanges') = 'array'
          then pref.default_policy->'blackoutRanges'
        else null
      end,
      '[]'::jsonb
    )
  from public.planner_preferences pref
  where p.id = pref.owner_id;

  select count(*) into v_pref_count from public.planner_preferences;
  select count(*) into v_join_count
  from public.profiles p
  join public.planner_preferences pref on pref.owner_id = p.id;

  if v_pref_count <> v_join_count then
    raise exception
      'transition invariant failed: preference/profile mapping mismatch (% vs %)',
      v_pref_count,
      v_join_count;
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.planner_preferences pref on pref.owner_id = p.id
    where p.timezone is distinct from pref.timezone
  ) then
    raise exception
      'transition invariant failed: mapped profile timezone diverged from planner preferences';
  end if;

  update public.profiles
  set timezone = 'UTC'
  where timezone is null;

  update public.profiles
  set week_starts_on = 1
  where week_starts_on is null;

  update public.profiles
  set rest_weekdays = '{}'::smallint[]
  where rest_weekdays is null;

  update public.profiles
  set blackout_ranges = '[]'::jsonb
  where blackout_ranges is null;

  if exists (
    select 1
    from public.profiles p
    where not exists (
      select 1
      from pg_catalog.pg_timezone_names tz
      where tz.name = p.timezone
    )
  ) then
    raise exception
      'transition invariant failed: profiles.timezone contains non-IANA values';
  end if;
end;
$$;

-- 2) Preserve user scheduling intent in public.planner_items.
do $$
declare
  v_source_rows bigint := 0;
  v_migrated_rows bigint := 0;
begin
  create temp table tmp_planner_item_candidates on commit drop as
  select
    item.id,
    plan.owner_id,
    coalesce(plan_goal.original_goal_id, plan_goal.goal_id) as goal_id,
    item.unit_key,
    item.scheduled_date,
    case
      when nullif(
        coalesce(item.scheduled_time_override, item.effective_scheduled_local_time),
        ''
      ) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then nullif(
        coalesce(item.scheduled_time_override, item.effective_scheduled_local_time),
        ''
      )
      else null
    end as scheduled_time,
    item.locked,
    item.revision,
    item.updated_at,
    plan.activated_at,
    plan.created_at
  from public.execution_plan_items item
  join public.execution_plans plan
    on plan.id = item.plan_id
   and plan.status = 'active'
  join public.execution_plan_goals plan_goal
    on plan_goal.id = item.plan_goal_id
   and plan_goal.plan_id = item.plan_id
   and plan_goal.owner_id = item.owner_id
  where item.scheduled_date is not null
    and coalesce(plan_goal.original_goal_id, plan_goal.goal_id) is not null;

  select count(*) into v_source_rows from tmp_planner_item_candidates;

  create temp table tmp_planner_item_unit_ranked on commit drop as
  select
    *,
    row_number() over (
      partition by goal_id, unit_key
      order by
        locked desc,
        revision desc,
        activated_at desc nulls last,
        created_at desc nulls last,
        updated_at desc nulls last,
        id desc
    ) as unit_rank
  from tmp_planner_item_candidates;

  create temp table tmp_planner_item_final on commit drop as
  with deduped_unit as (
    select *
    from tmp_planner_item_unit_ranked
    where unit_rank = 1
  ),
  deduped_date as (
    select
      *,
      row_number() over (
        partition by goal_id, scheduled_date
        order by
          locked desc,
          revision desc,
          activated_at desc nulls last,
          created_at desc nulls last,
          updated_at desc nulls last,
          id desc
      ) as date_rank
    from deduped_unit
  )
  select
    id,
    owner_id,
    goal_id,
    unit_key,
    scheduled_date,
    scheduled_time,
    locked
  from deduped_date
  where date_rank = 1;

  if exists (
    select 1
    from tmp_planner_item_final i
    where not exists (
      select 1 from public.goals g where g.id = i.goal_id
    )
  ) then
    raise exception
      'transition invariant failed: planner_items staging references missing goals';
  end if;

  delete from public.planner_items existing
  using (select distinct owner_id from tmp_planner_item_final) touched
  where existing.owner_id = touched.owner_id;

  insert into public.planner_items (
    id,
    owner_id,
    goal_id,
    unit_key,
    scheduled_date,
    scheduled_time,
    locked
  )
  select
    id,
    owner_id,
    goal_id,
    unit_key,
    scheduled_date,
    scheduled_time,
    locked
  from tmp_planner_item_final;

  select count(*) into v_migrated_rows from tmp_planner_item_final;

  if exists (
    select 1
    from public.planner_items
    group by goal_id, unit_key
    having count(*) > 1
  ) then
    raise exception
      'transition invariant failed: planner_items duplicate (goal_id, unit_key)';
  end if;

  if exists (
    select 1
    from public.planner_items
    group by goal_id, scheduled_date
    having count(*) > 1
  ) then
    raise exception
      'transition invariant failed: planner_items duplicate (goal_id, scheduled_date)';
  end if;

  if exists (
    select 1
    from public.planner_items i
    left join public.goals g on g.id = i.goal_id
    where g.id is null
  ) then
    raise exception
      'transition invariant failed: planner_items contains orphaned goals';
  end if;

  raise notice
    '[transition] planner_items migration complete. source_rows=%, migrated_rows=%',
    v_source_rows,
    v_migrated_rows;
end;
$$;

-- 3) Move coach persistence rows from private.* to public.*.
do $$
declare
  v_has_private_proposal_meta boolean := false;
  v_conversation_count bigint := 0;
  v_message_count bigint := 0;
begin
  if to_regclass('private.planner_coach_conversations') is null
    or to_regclass('private.planner_coach_conversation_messages') is null then
    raise exception
      'transition precondition failed: private coach tables are missing';
  end if;

  insert into public.planner_coach_conversations (
    id,
    owner_id,
    scope_month,
    timezone,
    title,
    preview_text,
    message_count,
    created_at,
    updated_at
  )
  select
    c.id,
    c.owner_id,
    c.scope_month,
    c.timezone,
    c.title,
    c.preview_text,
    c.message_count,
    c.created_at,
    c.updated_at
  from private.planner_coach_conversations c
  on conflict (id) do update
  set owner_id = excluded.owner_id,
      scope_month = excluded.scope_month,
      timezone = excluded.timezone,
      title = excluded.title,
      preview_text = excluded.preview_text,
      message_count = excluded.message_count,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'planner_coach_conversation_messages'
      and column_name = 'proposal_meta'
  ) into v_has_private_proposal_meta;

  if v_has_private_proposal_meta then
    insert into public.planner_coach_conversation_messages (
      id,
      conversation_id,
      owner_id,
      ordinal,
      role,
      content,
      proposal_meta,
      created_at
    )
    select
      m.id,
      m.conversation_id,
      m.owner_id,
      m.ordinal,
      m.role,
      m.content,
      m.proposal_meta,
      m.created_at
    from private.planner_coach_conversation_messages m
    on conflict (id) do update
    set conversation_id = excluded.conversation_id,
        owner_id = excluded.owner_id,
        ordinal = excluded.ordinal,
        role = excluded.role,
        content = excluded.content,
        proposal_meta = excluded.proposal_meta,
        created_at = excluded.created_at;
  else
    insert into public.planner_coach_conversation_messages (
      id,
      conversation_id,
      owner_id,
      ordinal,
      role,
      content,
      proposal_meta,
      created_at
    )
    select
      m.id,
      m.conversation_id,
      m.owner_id,
      m.ordinal,
      m.role,
      m.content,
      null::jsonb,
      m.created_at
    from private.planner_coach_conversation_messages m
    on conflict (id) do update
    set conversation_id = excluded.conversation_id,
        owner_id = excluded.owner_id,
        ordinal = excluded.ordinal,
        role = excluded.role,
        content = excluded.content,
        proposal_meta = excluded.proposal_meta,
        created_at = excluded.created_at;
  end if;

  perform pg_catalog.setval(
    pg_catalog.pg_get_serial_sequence(
      'public.planner_coach_conversation_messages',
      'id'
    ),
    greatest(
      1,
      coalesce((select max(id) from public.planner_coach_conversation_messages), 1)
    ),
    true
  );

  if exists (
    select 1
    from public.planner_coach_conversation_messages m
    join public.planner_coach_conversations c
      on c.id = m.conversation_id
    where c.owner_id <> m.owner_id
  ) then
    raise exception
      'transition invariant failed: coach message owner does not match conversation owner';
  end if;

  if exists (
    select 1
    from (
      select
        conversation_id,
        count(*) as row_count,
        count(distinct ordinal) as ordinal_count,
        min(ordinal) as min_ordinal,
        max(ordinal) as max_ordinal
      from public.planner_coach_conversation_messages
      group by conversation_id
    ) stats
    where min_ordinal <> 1
      or max_ordinal <> row_count
      or ordinal_count <> row_count
  ) then
    raise exception
      'transition invariant failed: coach message ordinals are not contiguous';
  end if;

  select count(*) into v_conversation_count
  from public.planner_coach_conversations;
  select count(*) into v_message_count
  from public.planner_coach_conversation_messages;

  raise notice
    '[transition] coach migration complete. conversations=%, messages=%',
    v_conversation_count,
    v_message_count;
end;
$$;

commit;
