-- Additive Phase 3 (part A):
-- Keep planner_preferences for compatibility while syncing preference writes into profiles.

create or replace function public.upsert_planner_preferences_service(
  p_owner uuid,
  p_timezone text,
  p_default_policy jsonb,
  p_policy_schema_version text default '1',
  p_policy_compiler_version text default '1',
  p_timezone_confirmed_at timestamptz default pg_catalog.now()
)
returns public.planner_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preferences public.planner_preferences;
  v_timezone text;
  v_timezone_confirmed_at timestamptz := coalesce(
    p_timezone_confirmed_at,
    pg_catalog.now()
  );
  v_week_starts_on smallint := 1;
  v_rest_weekdays smallint[] := '{}'::smallint[];
  v_blackout_ranges jsonb := '[]'::jsonb;
begin
  if p_owner is null then
    raise exception using
      errcode = '22023',
      message = 'owner is required';
  end if;

  v_timezone := nullif(pg_catalog.btrim(p_timezone), '');
  if v_timezone is null then
    raise exception using
      errcode = '22023',
      message = 'timezone is required';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names tz
    where tz.name = v_timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid planner timezone';
  end if;

  if p_default_policy is null or jsonb_typeof(p_default_policy) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'planner default policy must be a JSON object';
  end if;

  if p_default_policy ? 'weekStartsOn' then
    if coalesce(p_default_policy->>'weekStartsOn', '') !~ '^[0-6]$' then
      raise exception using
        errcode = '22023',
        message = 'defaultPolicy.weekStartsOn must be an integer between 0 and 6';
    end if;
    v_week_starts_on := (p_default_policy->>'weekStartsOn')::smallint;
  end if;

  if p_default_policy ? 'restWeekdays' then
    if jsonb_typeof(p_default_policy->'restWeekdays') <> 'array' then
      raise exception using
        errcode = '22023',
        message = 'defaultPolicy.restWeekdays must be an array';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(p_default_policy->'restWeekdays', '[]'::jsonb)
      ) as day_item(value)
      where day_item.value !~ '^[0-9]+$'
         or day_item.value::int < 0
         or day_item.value::int > 6
    ) then
      raise exception using
        errcode = '22023',
        message = 'defaultPolicy.restWeekdays entries must be 0..6';
    end if;
    select coalesce(
      array_agg(day_item.value::smallint order by day_item.ordinality),
      '{}'::smallint[]
    )
    into v_rest_weekdays
    from jsonb_array_elements_text(
      coalesce(p_default_policy->'restWeekdays', '[]'::jsonb)
    ) with ordinality as day_item(value, ordinality);
  end if;

  if p_default_policy ? 'blackoutRanges' then
    if jsonb_typeof(p_default_policy->'blackoutRanges') <> 'array' then
      raise exception using
        errcode = '22023',
        message = 'defaultPolicy.blackoutRanges must be an array';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(
        coalesce(p_default_policy->'blackoutRanges', '[]'::jsonb)
      ) as range_item(value)
      where jsonb_typeof(range_item.value) <> 'object'
         or not (range_item.value ? 'start')
         or not (range_item.value ? 'end')
         or coalesce(range_item.value->>'start', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or coalesce(range_item.value->>'end', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or (range_item.value->>'start') > (range_item.value->>'end')
    ) then
      raise exception using
        errcode = '22023',
        message = 'defaultPolicy.blackoutRanges entries must be valid date windows';
    end if;
    v_blackout_ranges := p_default_policy->'blackoutRanges';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(p_owner)
  );
  perform private.ensure_planner_state(p_owner);

  update public.profiles
  set timezone = v_timezone,
      timezone_confirmed_at = v_timezone_confirmed_at,
      week_starts_on = v_week_starts_on,
      rest_weekdays = v_rest_weekdays,
      blackout_ranges = v_blackout_ranges
  where id = p_owner;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'profile row is required before planner preferences can be upserted';
  end if;

  insert into public.planner_preferences (
    owner_id,
    timezone,
    default_policy,
    policy_schema_version,
    policy_compiler_version,
    timezone_confirmed_at
  )
  values (
    p_owner,
    v_timezone,
    p_default_policy,
    p_policy_schema_version,
    p_policy_compiler_version,
    v_timezone_confirmed_at
  )
  on conflict (owner_id) do update
  set timezone = excluded.timezone,
      default_policy = excluded.default_policy,
      policy_schema_version = excluded.policy_schema_version,
      policy_compiler_version = excluded.policy_compiler_version,
      timezone_confirmed_at = excluded.timezone_confirmed_at
  returning * into v_preferences;

  return v_preferences;
end;
$$;
