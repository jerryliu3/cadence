do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'goal_difficulty'
  ) then
    create type public.goal_difficulty as enum ('easy', 'medium', 'hard');
  end if;
end;
$$;

alter table public.goals
  add column if not exists difficulty public.goal_difficulty;

update public.goals
set difficulty = 'medium'::public.goal_difficulty
where difficulty is null;

alter table public.goals
  alter column difficulty set default 'medium'::public.goal_difficulty,
  alter column difficulty set not null;

create or replace function private.xp_goal_difficulty_multiplier(
  p_difficulty public.goal_difficulty
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_difficulty, 'medium'::public.goal_difficulty)
    when 'easy'::public.goal_difficulty then 0.5::numeric
    when 'hard'::public.goal_difficulty then 2.0::numeric
    else 1.0::numeric
  end;
$$;

create or replace function private.xp_goal_achievement_points(
  p_difficulty public.goal_difficulty
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    1,
    pg_catalog.floor(
      private.xp_goal_difficulty_multiplier(p_difficulty)
      * 100::numeric
    )::integer
  );
$$;

create or replace function private.xp_goal_achievement_points()
returns integer
language sql
immutable
set search_path = ''
as $$
  select private.xp_goal_achievement_points('medium'::public.goal_difficulty);
$$;

create or replace function private.xp_points_for_completion_source(
  p_source public.completion_source,
  p_difficulty public.goal_difficulty
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with multiplier as (
    select private.xp_goal_difficulty_multiplier(p_difficulty) as value
  )
  select case
    when p_source = 'linked_cascade'::public.completion_source
      then greatest(
        1,
        pg_catalog.floor(
          private.xp_manual_completion_points()
          * private.xp_cascade_multiplier()
          * (select value from multiplier)
        )::integer
      )
    when p_source = 'external_sync'::public.completion_source
      then greatest(
        1,
        pg_catalog.floor(
          private.xp_manual_completion_points() * (select value from multiplier)
        )::integer
      )
    else greatest(
      1,
      pg_catalog.floor(
        private.xp_manual_completion_points() * (select value from multiplier)
      )::integer
    )
  end;
$$;

create or replace function private.xp_points_for_completion_source(
  p_source public.completion_source
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select private.xp_points_for_completion_source(
    p_source,
    'medium'::public.goal_difficulty
  );
$$;

create or replace function private.goal_xp_credited_units(
  p_user_id uuid,
  p_goal_id uuid
)
returns table (
  source_key text,
  track_key text,
  event_type text,
  earned_on date,
  completion_id uuid,
  completion_source public.completion_source,
  xp_amount integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_goal record;
  v_timezone text;
  v_as_of date;
  v_credit_end date;
  v_target integer;
  v_interval public.recurrence_interval;
begin
  if p_user_id is null or p_goal_id is null then
    return;
  end if;

  select
    g.id,
    g.start_date,
    g.end_date,
    g.frequency_type,
    g.recurrence_interval,
    g.target_count,
    g.archived_at,
    g.is_deleted,
    g.category_key,
    g.difficulty
  into v_goal
  from public.goals g
  where g.id = p_goal_id;

  if not found or v_goal.is_deleted then
    return;
  end if;

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = p_user_id;

  v_as_of := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  if v_goal.archived_at is not null then
    v_as_of := least(
      v_as_of,
      (v_goal.archived_at at time zone coalesce(v_timezone, 'UTC'))::date
    );
  end if;

  v_credit_end := least(v_as_of, coalesce(v_goal.end_date, v_as_of));
  if v_credit_end < v_goal.start_date then
    return;
  end if;

  if v_goal.frequency_type = 'fixed_milestones'::public.goal_frequency_type then
    v_target := greatest(1, coalesce(v_goal.target_count, 1));

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      ('milestone:' || credited.ordinal::text)::text as source_key,
      v_goal.category_key::text as track_key,
      'completion_credit'::text as event_type,
      credited.completed_on as earned_on,
      credited.completion_id,
      credited.completion_source,
      private.xp_points_for_completion_source(
        credited.completion_source,
        v_goal.difficulty
      ) as xp_amount
    from credited
    order by credited.ordinal asc;

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      'achievement'::text as source_key,
      v_goal.category_key::text as track_key,
      'goal_achievement'::text as event_type,
      pg_catalog.max(credited.completed_on) as earned_on,
      null::uuid as completion_id,
      null::public.completion_source as completion_source,
      private.xp_goal_achievement_points(v_goal.difficulty) as xp_amount
    from credited
    having pg_catalog.count(*) >= v_target;

    return;
  end if;

  if (
    v_goal.frequency_type = 'recurring'::public.goal_frequency_type
    and coalesce(v_goal.target_count, 0) > 0
  ) then
    v_target := greatest(1, coalesce(v_goal.target_count, 1));

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      ('total:' || credited.ordinal::text)::text as source_key,
      v_goal.category_key::text as track_key,
      'completion_credit'::text as event_type,
      credited.completed_on as earned_on,
      credited.completion_id,
      credited.completion_source,
      private.xp_points_for_completion_source(
        credited.completion_source,
        v_goal.difficulty
      ) as xp_amount
    from credited
    order by credited.ordinal asc;

    return query
    with admissible as (
      select
        c.id as completion_id,
        c.completed_on,
        c.source as completion_source,
        pg_catalog.row_number() over (
          order by c.completed_on asc, c.id asc
        ) as ordinal
      from public.completions c
      where c.user_id = p_user_id
        and c.goal_id = p_goal_id
        and c.completed_on between v_goal.start_date and v_credit_end
    ),
    credited as (
      select *
      from admissible
      where ordinal <= v_target
    )
    select
      'achievement'::text as source_key,
      v_goal.category_key::text as track_key,
      'goal_achievement'::text as event_type,
      pg_catalog.max(credited.completed_on) as earned_on,
      null::uuid as completion_id,
      null::public.completion_source as completion_source,
      private.xp_goal_achievement_points(v_goal.difficulty) as xp_amount
    from credited
    having pg_catalog.count(*) >= v_target;

    return;
  end if;

  v_interval := coalesce(v_goal.recurrence_interval, 'daily'::public.recurrence_interval);

  return query
  with admissible as (
    select
      c.id as completion_id,
      c.completed_on,
      c.source as completion_source,
      private.goal_period_key(v_goal.start_date, v_interval, c.completed_on) as period_key
    from public.completions c
    where c.user_id = p_user_id
      and c.goal_id = p_goal_id
      and c.completed_on between v_goal.start_date and v_credit_end
  ),
  credited as (
    select distinct on (a.period_key)
      a.completion_id,
      a.completed_on,
      a.completion_source,
      a.period_key
    from admissible a
    order by a.period_key asc, a.completed_on asc, a.completion_id asc
  )
  select
    ('cadence:' || credited.period_key)::text as source_key,
    v_goal.category_key::text as track_key,
    'completion_credit'::text as event_type,
    credited.completed_on as earned_on,
    credited.completion_id,
    credited.completion_source,
    private.xp_points_for_completion_source(
      credited.completion_source,
      v_goal.difficulty
    ) as xp_amount
  from credited
  order by credited.period_key asc;
end;
$$;

drop function if exists public.create_goal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  text[],
  date,
  date,
  text,
  uuid,
  boolean
);

create function public.create_goal(
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
  p_team_id uuid default null,
  p_is_private boolean default false,
  p_difficulty public.goal_difficulty default null
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
  v_difficulty public.goal_difficulty := coalesce(
    p_difficulty,
    'medium'::public.goal_difficulty
  );
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  if p_team_id is not null
    and not private.is_active_team_member(p_team_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not a member of team';
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
    team_id,
    is_private,
    difficulty,
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
    p_team_id,
    coalesce(p_is_private, false),
    v_difficulty,
    false
  );

  return v_id;
end;
$$;

drop function if exists public.update_goal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  text[],
  date,
  date,
  text,
  uuid,
  boolean
);

create function public.update_goal(
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
  p_team_id uuid default null,
  p_is_private boolean default false,
  p_difficulty public.goal_difficulty default 'medium'
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
  v_is_private boolean := coalesce(p_is_private, false);
  v_difficulty public.goal_difficulty;
begin
  perform private.assert_goal_owner(p_id, v_uid);

  if p_team_id is not null
    and not private.is_active_team_member(p_team_id, v_uid) then
    raise exception using
      errcode = '42501',
      message = 'not a member of team';
  end if;

  select *
  into v_old
  from public.goals
  where id = p_id
  for update;

  select n.category, n.category_key
  into v_category, v_category_key
  from private.normalize_goal_category_pair(p_category, p_category_key) n;

  v_difficulty := coalesce(
    p_difficulty,
    v_old.difficulty,
    'medium'::public.goal_difficulty
  );

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
    team_id = p_team_id,
    is_private = v_is_private,
    difficulty = v_difficulty
  where id = p_id
    and owner_id = v_uid;

  if v_is_private then
    delete from public.goal_shares
    where goal_id = p_id;
  end if;

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
      nullif(v_item->>'team_id', '')::uuid,
      coalesce((v_item->>'is_private')::boolean, false),
      coalesce(
        nullif(v_item->>'difficulty', '')::public.goal_difficulty,
        'medium'::public.goal_difficulty
      )
    );
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$$;

revoke all on function private.xp_goal_difficulty_multiplier(public.goal_difficulty)
  from public, anon, authenticated;
grant execute on function private.xp_goal_difficulty_multiplier(public.goal_difficulty)
  to service_role;

revoke all on function private.xp_goal_achievement_points(public.goal_difficulty)
  from public, anon, authenticated;
grant execute on function private.xp_goal_achievement_points(public.goal_difficulty)
  to service_role;

revoke all on function private.xp_points_for_completion_source(
  public.completion_source,
  public.goal_difficulty
) from public, anon, authenticated;
grant execute on function private.xp_points_for_completion_source(
  public.completion_source,
  public.goal_difficulty
) to service_role;

revoke execute on function public.create_goal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  text[],
  date,
  date,
  text,
  uuid,
  boolean,
  public.goal_difficulty
) from public, anon;
grant execute on function public.create_goal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  text[],
  date,
  date,
  text,
  uuid,
  boolean,
  public.goal_difficulty
) to authenticated, service_role;

revoke execute on function public.update_goal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  text[],
  date,
  date,
  text,
  uuid,
  boolean,
  public.goal_difficulty
) from public, anon;
grant execute on function public.update_goal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  public.goal_frequency_type,
  public.recurrence_interval,
  integer,
  text[],
  date,
  date,
  text,
  uuid,
  boolean,
  public.goal_difficulty
) to authenticated, service_role;
