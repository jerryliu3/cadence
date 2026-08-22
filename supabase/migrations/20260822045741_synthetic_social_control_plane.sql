create table if not exists public.synthetic_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  persona text not null check (persona in ('low', 'medium', 'high')),
  daily_budget integer not null check (daily_budget between 1 and 12),
  completions_today integer not null default 0 check (completions_today >= 0),
  last_active_date date,
  enabled boolean not null default true,
  is_synthetic boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists synthetic_users_enabled_idx
  on public.synthetic_users (enabled, persona);

drop trigger if exists set_synthetic_users_updated_at
  on public.synthetic_users;
create trigger set_synthetic_users_updated_at
before update on public.synthetic_users
for each row execute function public.set_updated_at();

create table if not exists public.synthetic_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  max_completions_per_tick integer not null default 8 check (max_completions_per_tick between 0 and 50),
  max_reactions_per_tick integer not null default 12 check (max_reactions_per_tick between 0 and 100),
  throttle_above_real_dau integer not null default 50 check (throttle_above_real_dau >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

drop trigger if exists set_synthetic_config_updated_at
  on public.synthetic_config;
create trigger set_synthetic_config_updated_at
before update on public.synthetic_config
for each row execute function public.set_updated_at();

insert into public.synthetic_config (id)
values (1)
on conflict (id) do nothing;

alter table public.synthetic_users enable row level security;
alter table public.synthetic_config enable row level security;

revoke all on table public.synthetic_users from public, anon, authenticated;
revoke all on table public.synthetic_config from public, anon, authenticated;
grant select, insert, update, delete on table public.synthetic_users to service_role;
grant select, insert, update, delete on table public.synthetic_config to service_role;

create or replace function private.synthetic_uuid_from_text(p_value text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (
    pg_catalog.substr(md5(coalesce(p_value, '')), 1, 8) || '-' ||
    pg_catalog.substr(md5(coalesce(p_value, '')), 9, 4) || '-' ||
    pg_catalog.substr(md5(coalesce(p_value, '')), 13, 4) || '-' ||
    pg_catalog.substr(md5(coalesce(p_value, '')), 17, 4) || '-' ||
    pg_catalog.substr(md5(coalesce(p_value, '')), 21, 12)
  )::uuid
$$;

revoke all on function private.synthetic_uuid_from_text(text)
  from public, anon, authenticated;
grant execute on function private.synthetic_uuid_from_text(text)
  to service_role;

create or replace function public.synthetic_apply_completion_service(
  p_user_id uuid,
  p_goal_id uuid,
  p_completed_on date default current_date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal_owner uuid;
begin
  if p_user_id is null or p_goal_id is null or p_completed_on is null then
    raise exception
      using errcode = '22023',
            message = 'synthetic_completion_invalid_args';
  end if;

  if p_completed_on > current_date then
    raise exception
      using errcode = '22023',
            message = 'synthetic_completion_future_date';
  end if;

  select goal.owner_id
  into v_goal_owner
  from public.goals goal
  where goal.id = p_goal_id
    and goal.is_deleted = false
    and goal.archived_at is null;

  if v_goal_owner is null or v_goal_owner <> p_user_id then
    return false;
  end if;

  insert into public.completions (goal_id, user_id, completed_on, source)
  values (
    p_goal_id,
    p_user_id,
    p_completed_on,
    'external_sync'::public.completion_source
  )
  on conflict (goal_id, user_id, completed_on) do nothing;

  if not found then
    return false;
  end if;

  perform public.recompute_goal_xp_service(p_user_id, p_goal_id);
  return true;
end;
$$;

revoke all on function public.synthetic_apply_completion_service(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.synthetic_apply_completion_service(uuid, uuid, date)
  to service_role;

create or replace function public.provision_synthetic_users_service(
  p_target_count integer default 100,
  p_goals_per_user integer default 6
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idx integer;
  v_goal_slot integer;
  v_template_idx integer;
  v_user_id uuid;
  v_goal_id uuid;
  v_identity_id uuid;
  v_email text;
  v_username text;
  v_display_name text;
  v_persona text;
  v_daily_budget integer;
  v_goal_title text;
  v_goal_category_key text;
  v_goal_titles text[] := array[
    'Morning walk',
    'Focused work block',
    'Read 20 pages',
    'Call a friend',
    'Strength workout',
    'Journal for 10 minutes',
    'Plan tomorrow',
    'Hydration target',
    'Review finances',
    'Practice a skill',
    'Stretch routine',
    'Declutter one area'
  ];
  v_goal_categories text[] := array[
    'health',
    'career',
    'personal',
    'relationships',
    'health',
    'personal',
    'career',
    'health',
    'personal',
    'career',
    'health',
    'personal'
  ];
begin
  if p_target_count is null or p_target_count < 1 or p_target_count > 500 then
    raise exception
      using errcode = '22023',
            message = 'synthetic_target_count_out_of_range';
  end if;

  if p_goals_per_user is null or p_goals_per_user < 1 or p_goals_per_user > 12 then
    raise exception
      using errcode = '22023',
            message = 'synthetic_goals_per_user_out_of_range';
  end if;

  insert into public.synthetic_config (id)
  values (1)
  on conflict (id) do nothing;

  for v_idx in 1..p_target_count loop
    v_user_id := private.synthetic_uuid_from_text('synthetic-user-' || v_idx::text);
    v_identity_id := private.synthetic_uuid_from_text('synthetic-identity-' || v_idx::text);
    v_email := 'synthetic+' || lpad(v_idx::text, 3, '0') || '@cadence.local';
    v_username := 'sim_user_' || lpad(v_idx::text, 3, '0');
    v_display_name := 'User ' || lpad(v_idx::text, 3, '0');

    if v_idx <= 40 then
      v_persona := 'low';
      v_daily_budget := 1;
    elsif v_idx <= 80 then
      v_persona := 'medium';
      v_daily_budget := 3;
    else
      v_persona := 'high';
      v_daily_budget := 6;
    end if;

    insert into auth.users (
      id,
      aud,
      role,
      email,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      pg_catalog.now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'username', v_username,
        'display_name', v_display_name
      ),
      pg_catalog.now(),
      pg_catalog.now()
    )
    on conflict (id) do update
      set email = excluded.email,
          raw_user_meta_data = excluded.raw_user_meta_data,
          email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
          updated_at = pg_catalog.now();

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      v_identity_id,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_email,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    )
    on conflict (id) do update
      set identity_data = excluded.identity_data,
          provider_id = excluded.provider_id,
          updated_at = pg_catalog.now();

    insert into public.profiles (
      id,
      username,
      display_name,
      avatar_url,
      social_activity_visible
    )
    values (
      v_user_id,
      v_username,
      v_display_name,
      null,
      true
    )
    on conflict (id) do update
      set username = excluded.username,
          display_name = excluded.display_name,
          social_activity_visible = true;

    insert into public.synthetic_users (
      user_id,
      persona,
      daily_budget,
      completions_today,
      last_active_date,
      enabled
    )
    values (
      v_user_id,
      v_persona,
      v_daily_budget,
      0,
      null,
      true
    )
    on conflict (user_id) do update
      set persona = excluded.persona,
          daily_budget = excluded.daily_budget,
          enabled = true;

    for v_goal_slot in 1..p_goals_per_user loop
      v_template_idx := ((v_idx + v_goal_slot - 2) % array_length(v_goal_titles, 1)) + 1;
      v_goal_title := v_goal_titles[v_template_idx];
      v_goal_category_key := v_goal_categories[v_template_idx];
      v_goal_id := private.synthetic_uuid_from_text(
        v_user_id::text || ':synthetic-goal:' || v_goal_slot::text
      );

      insert into public.goals (
        id,
        owner_id,
        title,
        description,
        category,
        category_key,
        color,
        frequency_type,
        recurrence_interval,
        target_count,
        start_date,
        end_date,
        is_private,
        is_deleted,
        archived_at
      )
      values (
        v_goal_id,
        v_user_id,
        v_goal_title,
        null,
        initcap(v_goal_category_key),
        v_goal_category_key,
        '#64748b',
        'recurring'::public.goal_frequency_type,
        'weekly'::public.recurrence_interval,
        3,
        current_date - 30,
        null,
        false,
        false,
        null
      )
      on conflict (id) do update
        set title = excluded.title,
            category = excluded.category,
            category_key = excluded.category_key,
            frequency_type = excluded.frequency_type,
            recurrence_interval = excluded.recurrence_interval,
            target_count = excluded.target_count,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            is_private = false,
            is_deleted = false,
            archived_at = null;
    end loop;
  end loop;

  insert into public.challenge_participants (
    challenge_id,
    subject_kind,
    subject_id
  )
  select
    challenge.id,
    'user'::public.social_subject_kind,
    synthetic.user_id
  from public.synthetic_users synthetic
  join public.challenges challenge
    on challenge.subject_kind = 'user'::public.social_subject_kind
   and challenge.status in ('scheduled'::public.challenge_status, 'active'::public.challenge_status)
   and challenge.audience_kind = 'global'::public.social_audience_kind
  where synthetic.enabled = true
  on conflict (challenge_id, subject_kind, subject_id) do nothing;

  return p_target_count;
end;
$$;

revoke all on function public.provision_synthetic_users_service(integer, integer)
  from public, anon, authenticated;
grant execute on function public.provision_synthetic_users_service(integer, integer)
  to service_role;
