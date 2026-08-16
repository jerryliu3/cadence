create or replace function public.import_training_plan(
  p_goals jsonb,
  p_expected_digest text
)
returns table (
  schedule_digest text,
  goal_count integer,
  session_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_goal_count integer := 60;
  c_max_sessions_per_goal integer := 366;
  v_owner uuid := auth.uid();
  v_goal jsonb;
  v_goal_sessions jsonb;
  v_session jsonb;
  v_goal_id uuid;
  v_goal_count integer := 0;
  v_session_count integer := 0;
  v_title text;
  v_description text;
  v_reward_text text;
  v_category text;
  v_category_key text;
  v_color text;
  v_frequency_type public.goal_frequency_type;
  v_recurrence_interval public.recurrence_interval;
  v_target_count integer;
  v_start_date date;
  v_end_date date;
  v_default_local_time text;
  v_session_date date;
  v_session_time text;
  v_difficulty_text text;
  v_has_goal_difficulty boolean := false;
  v_current_digest text;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_goals is null or jsonb_typeof(p_goals) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_training_plan_payload';
  end if;
  if jsonb_array_length(p_goals) > c_max_goal_count then
    raise exception using errcode = '22023', message = 'training_plan_goals_limit_exceeded';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );
  select public.get_planner_schedule_digest(v_owner)
  into v_current_digest;
  if coalesce(p_expected_digest, '') <> coalesce(v_current_digest, '') then
    raise exception using errcode = 'P0001', message = 'stale_schedule';
  end if;
  select exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'goal_difficulty'
  )
  into v_has_goal_difficulty;

  for v_goal in
    select value
    from jsonb_array_elements(p_goals)
  loop
    v_title := nullif(btrim(v_goal->>'title'), '');
    if v_title is null then
      raise exception using errcode = '22023', message = 'invalid_training_plan_payload';
    end if;

    v_description := nullif(btrim(v_goal->>'description'), '');
    v_reward_text := nullif(btrim(v_goal->>'reward_text'), '');
    v_category := coalesce(nullif(btrim(v_goal->>'category'), ''), 'general');
    v_category_key := nullif(btrim(v_goal->>'category_key'), '');
    v_color := nullif(btrim(v_goal->>'color'), '');
    v_frequency_type := coalesce(
      nullif(v_goal->>'frequency_type', '')::public.goal_frequency_type,
      'recurring'::public.goal_frequency_type
    );
    v_recurrence_interval := nullif(
      v_goal->>'recurrence_interval',
      ''
    )::public.recurrence_interval;
    v_target_count := nullif(v_goal->>'target_count', '')::integer;
    v_start_date := coalesce(
      nullif(v_goal->>'start_date', '')::date,
      current_date
    );
    v_end_date := nullif(v_goal->>'end_date', '')::date;
    v_default_local_time := nullif(btrim(v_goal->>'default_local_time'), '');
    v_difficulty_text := nullif(btrim(v_goal->>'difficulty'), '');
    if v_default_local_time is not null
      and v_default_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then
      raise exception using errcode = '22023', message = 'invalid_scheduled_time';
    end if;

    if v_has_goal_difficulty then
      execute
        $sql$
        select public.create_goal(
          $1::uuid,
          $2::text,
          $3::text,
          $4::text,
          $5::text,
          $6::text,
          $7::text,
          $8::public.goal_frequency_type,
          $9::public.recurrence_interval,
          $10::integer,
          $11::text[],
          $12::date,
          $13::date,
          $14::text,
          $15::uuid,
          $16::boolean,
          coalesce($17::public.goal_difficulty, 'medium'::public.goal_difficulty)
        )
        $sql$
      into v_goal_id
      using
        coalesce((v_goal->>'id')::uuid, gen_random_uuid()),
        v_title,
        v_description,
        v_reward_text,
        v_category,
        v_category_key,
        v_color,
        v_frequency_type,
        v_recurrence_interval,
        v_target_count,
        null::text[],
        v_start_date,
        v_end_date,
        v_default_local_time,
        null::uuid,
        false,
        v_difficulty_text;
    else
      execute
        $sql$
        select public.create_goal(
          $1::uuid,
          $2::text,
          $3::text,
          $4::text,
          $5::text,
          $6::text,
          $7::text,
          $8::public.goal_frequency_type,
          $9::public.recurrence_interval,
          $10::integer,
          $11::text[],
          $12::date,
          $13::date,
          $14::text,
          $15::uuid,
          $16::boolean
        )
        $sql$
      into v_goal_id
      using
        coalesce((v_goal->>'id')::uuid, gen_random_uuid()),
        v_title,
        v_description,
        v_reward_text,
        v_category,
        v_category_key,
        v_color,
        v_frequency_type,
        v_recurrence_interval,
        v_target_count,
        null::text[],
        v_start_date,
        v_end_date,
        v_default_local_time,
        null::uuid,
        false;
    end if;
    v_goal_count := v_goal_count + 1;

    if v_goal ? 'sessions' and jsonb_typeof(v_goal->'sessions') <> 'array' then
      raise exception using errcode = '22023', message = 'invalid_training_plan_payload';
    end if;
    v_goal_sessions := coalesce(v_goal->'sessions', '[]'::jsonb);
    if jsonb_array_length(v_goal_sessions) > c_max_sessions_per_goal then
      raise exception using errcode = '22023', message = 'training_plan_sessions_limit_exceeded';
    end if;

    for v_session in
      select value
      from jsonb_array_elements(v_goal_sessions)
    loop
      v_session_date := nullif(v_session->>'scheduled_date', '')::date;
      if v_session_date is null then
        raise exception using errcode = '22023', message = 'invalid_training_plan_session';
      end if;
      if v_session_date < v_start_date
        or (v_end_date is not null and v_session_date > v_end_date)
      then
        raise exception using errcode = 'P0001', message = 'scheduled_outside_goal_lifetime';
      end if;

      v_session_time := nullif(btrim(v_session->>'scheduled_time'), '');
      if v_session_time is not null
        and v_session_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then
        raise exception using errcode = '22023', message = 'invalid_scheduled_time';
      end if;

      begin
        insert into public.planner_items (
          owner_id,
          goal_id,
          unit_key,
          scheduled_date,
          original_scheduled_date,
          scheduled_time,
          locked
        )
        values (
          v_owner,
          v_goal_id,
          'manual:' || gen_random_uuid()::text,
          v_session_date,
          v_session_date,
          v_session_time,
          true
        );
      exception
        when unique_violation then
          raise exception using errcode = 'P0001', message = 'schedule_conflict';
      end;
      v_session_count := v_session_count + 1;
    end loop;
  end loop;

  return query
  select
    public.get_planner_schedule_digest(v_owner),
    v_goal_count,
    v_session_count;
exception
  when invalid_text_representation
    or datetime_field_overflow
    or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'invalid_training_plan_payload';
end;
$$;

drop function if exists public.import_training_plan(jsonb);
revoke execute on function public.import_training_plan(jsonb, text) from public, anon;
grant execute on function public.import_training_plan(jsonb, text) to authenticated, service_role;
