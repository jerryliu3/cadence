create table if not exists public.synthetic_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  persona text not null check (persona in ('low', 'medium', 'high')),
  account_private boolean not null default true,
  archetype text not null default 'general',
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
  p_target_count integer default 10,
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
  v_goal_seed integer;
  v_action_idx integer;
  v_focus_idx integer;
  v_context_idx integer;
  v_first_idx integer;
  v_last_idx integer;
  v_interval_idx integer;
  v_low_cutoff integer;
  v_medium_cutoff integer;
  v_combined_name_count integer;
  v_user_id uuid;
  v_goal_id uuid;
  v_identity_id uuid;
  v_email text;
  v_username text;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_archetype text;
  v_persona text;
  v_daily_budget integer;
  v_goal_title text;
  v_goal_focus text;
  v_goal_context text;
  v_goal_action text;
  v_goal_category_key text;
  v_goal_color text;
  v_goal_interval public.recurrence_interval;
  v_goal_target_count integer;
  v_first_names text[] := array[
    'Noah','Liam','Mason','Ethan','Lucas','Aiden','Caleb','Owen','Jayden','Amir','Arjun','Mateo','Diego',
    'Jordan','Evan','Logan','Avery','Maya','Sofia','Chloe','Naomi','Aaliyah','Jasmine','Leah','Isabella','Priya'
  ];
  v_last_names text[] := array[
    'Nguyen','Rodriguez','Patel','Johnson','Chen','Garcia','Martinez','Singh','Brown','Kim','Campbell','Anderson',
    'Taylor','Hernandez','Lopez','Gonzalez','Wilson','Tremblay','Carter','Scott','Walker','Young','Hall','Wright',
    'Allen','Rivera'
  ];
  v_archetypes text[] := array[
    'student',
    'office_worker',
    'finance_analyst',
    'software_engineer',
    'teacher',
    'phd_student',
    'nurse',
    'sales_rep',
    'designer',
    'fitness_coach'
  ];
  v_goal_actions text[] := array[
    'Complete',
    'Prepare',
    'Draft',
    'Review',
    'Practice',
    'Ship',
    'Publish',
    'Refine',
    'Analyze',
    'Present',
    'Document',
    'Build',
    'Coach',
    'Study',
    'Plan',
    'Automate',
    'Audit',
    'Improve',
    'Prototype',
    'Teach'
  ];
  v_goal_focuses text[] := array[
    'lecture notes',
    'client updates',
    'sprint tasks',
    'portfolio pieces',
    'lesson plans',
    'research summary',
    'budget model',
    'system design',
    'training session',
    'sales pipeline',
    'lab experiment',
    'code review checklist',
    'team onboarding guide',
    'proposal deck',
    'networking outreach',
    'writing session',
    'career prep tasks',
    'habit tracker',
    'study roadmap',
    'project milestone'
  ];
  v_goal_contexts text[] := array[
    'before lunch',
    'for this week',
    'for the next sprint',
    'for month-end',
    'with a 30-minute timer',
    'before 9am',
    'after work',
    'for Friday delivery',
    'for peer feedback',
    'for class prep',
    'for manager review',
    'for team handoff',
    'for client follow-up',
    'for publication',
    'for interview prep',
    'for quarterly targets',
    'for presentation day',
    'for weekend planning',
    'for personal growth',
    'for next check-in'
  ];
begin
  if p_target_count is null or p_target_count < 1 or p_target_count > 500 then
    raise exception
      using errcode = '22023',
            message = 'synthetic_target_count_out_of_range';
  end if;

  if p_goals_per_user is null or p_goals_per_user < 1 or p_goals_per_user > 24 then
    raise exception
      using errcode = '22023',
            message = 'synthetic_goals_per_user_out_of_range';
  end if;

  v_low_cutoff := pg_catalog.floor(p_target_count::numeric * 0.4)::integer;
  v_medium_cutoff := v_low_cutoff + pg_catalog.floor(p_target_count::numeric * 0.4)::integer;
  v_combined_name_count := pg_catalog.array_length(v_first_names, 1) * pg_catalog.array_length(v_last_names, 1);

  insert into public.synthetic_config (id)
  values (1)
  on conflict (id) do nothing;

  for v_idx in 1..p_target_count loop
    v_first_idx := ((v_idx - 1) % pg_catalog.array_length(v_first_names, 1)) + 1;
    v_last_idx := (((v_idx - 1) / pg_catalog.array_length(v_first_names, 1)) % pg_catalog.array_length(v_last_names, 1)) + 1;
    v_first_name := v_first_names[v_first_idx];
    v_last_name := v_last_names[v_last_idx];
    v_display_name := v_first_name || ' ' || v_last_name;
    v_username := pg_catalog.lower(
      regexp_replace(
        v_first_name || '_' || v_last_name || case
          when v_idx > v_combined_name_count then '_' || v_idx::text
          else ''
        end,
        '[^a-z0-9_]+',
        '',
        'g'
      )
    );
    v_archetype := v_archetypes[((v_idx - 1) % pg_catalog.array_length(v_archetypes, 1)) + 1];

    v_user_id := private.synthetic_uuid_from_text('synthetic-user-' || v_idx::text);
    v_identity_id := private.synthetic_uuid_from_text('synthetic-identity-' || v_idx::text);
    v_email := 'synthetic+' || lpad(v_idx::text, 3, '0') || '@cadence.local';

    if v_idx <= v_low_cutoff then
      v_persona := 'low';
      v_daily_budget := 1;
    elsif v_idx <= v_medium_cutoff then
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
        'display_name', v_display_name,
        'private_account', true,
        'archetype', v_archetype,
        'region', 'north_america',
        'age_band', '20_30'
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
      account_private,
      archetype,
      daily_budget,
      completions_today,
      last_active_date,
      enabled
    )
    values (
      v_user_id,
      v_persona,
      true,
      v_archetype,
      v_daily_budget,
      0,
      null,
      true
    )
    on conflict (user_id) do update
      set persona = excluded.persona,
          account_private = true,
          archetype = excluded.archetype,
          daily_budget = excluded.daily_budget,
          enabled = true;

    for v_goal_slot in 1..p_goals_per_user loop
      v_goal_seed := ((v_idx - 1) * p_goals_per_user) + v_goal_slot;
      v_action_idx := ((v_goal_seed - 1) % pg_catalog.array_length(v_goal_actions, 1)) + 1;
      v_focus_idx := (((v_goal_seed - 1) / pg_catalog.array_length(v_goal_actions, 1)) % pg_catalog.array_length(v_goal_focuses, 1)) + 1;
      v_context_idx := (((v_goal_seed - 1) / (pg_catalog.array_length(v_goal_actions, 1) * pg_catalog.array_length(v_goal_focuses, 1))) % pg_catalog.array_length(v_goal_contexts, 1)) + 1;
      v_goal_action := v_goal_actions[v_action_idx];
      v_goal_focus := v_goal_focuses[v_focus_idx];
      v_goal_context := v_goal_contexts[v_context_idx];
      v_goal_title := initcap(replace(v_archetype, '_', ' ')) || ': ' || v_goal_action || ' ' || v_goal_focus || ' ' || v_goal_context;

      if v_archetype in ('fitness_coach', 'nurse') then
        v_goal_category_key := 'health';
      elsif v_archetype in ('office_worker', 'finance_analyst', 'software_engineer', 'teacher', 'phd_student', 'sales_rep') then
        v_goal_category_key := 'career';
      elsif v_archetype in ('student', 'designer') then
        v_goal_category_key := 'personal';
      else
        v_goal_category_key := 'other';
      end if;

      v_goal_color := case v_goal_category_key
        when 'health' then '#10b981'
        when 'career' then '#8b5cf6'
        when 'personal' then '#6366f1'
        when 'relationships' then '#f43f5e'
        else '#64748b'
      end;

      v_interval_idx := ((v_goal_seed - 1) % 3) + 1;
      v_goal_interval := case v_interval_idx
        when 1 then 'daily'::public.recurrence_interval
        when 2 then 'weekly'::public.recurrence_interval
        else 'monthly'::public.recurrence_interval
      end;
      v_goal_target_count := case v_goal_interval
        when 'daily'::public.recurrence_interval then 5
        when 'weekly'::public.recurrence_interval then 3
        else 1
      end;

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
        v_goal_color,
        'recurring'::public.goal_frequency_type,
        v_goal_interval,
        v_goal_target_count,
        current_date - 30,
        null,
        true,
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
            is_private = true,
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
