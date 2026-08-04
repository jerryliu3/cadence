create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.planner_owner_lock_key(p_owner uuid)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    'resolution.planner.owner.v1:' || p_owner::text,
    672814780213
  );
$$;

create or replace function private.is_valid_planner_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_timezone is not null
    and pg_catalog.length(p_timezone) between 1 and 100
    and exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    );
$$;

create or replace function private.planner_json_depth(p_value jsonb)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  with recursive nodes(value, depth) as (
    select p_value, 1
    union all
    select child.value, nodes.depth + 1
    from nodes
    cross join lateral (
      select element.value
      from pg_catalog.jsonb_array_elements(
        case
          when pg_catalog.jsonb_typeof(nodes.value) = 'array'
            then nodes.value
          else '[]'::jsonb
        end
      ) as element(value)
      union all
      select member.value
      from pg_catalog.jsonb_each(
        case
          when pg_catalog.jsonb_typeof(nodes.value) = 'object'
            then nodes.value
          else '{}'::jsonb
        end
      ) as member(key, value)
    ) as child
    where nodes.depth <= 32
  )
  select coalesce(pg_catalog.max(depth), 0)::integer
  from nodes;
$$;

create or replace function private.validate_planner_json(
  p_value jsonb,
  p_expected_type text,
  p_max_bytes integer default 262144,
  p_max_depth integer default 16
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_value is not null
    and p_expected_type in ('array', 'object')
    and pg_catalog.jsonb_typeof(p_value) = p_expected_type
    and p_max_bytes between 1 and 3145728
    and pg_catalog.octet_length(p_value::text) <= p_max_bytes
    and p_max_depth between 1 and 32
    and private.planner_json_depth(p_value) <= p_max_depth;
$$;

create table private.planner_state (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  canonical_revision bigint not null default 0
    check (canonical_revision >= 0),
  execution_revision bigint not null default 0
    check (execution_revision >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.planner_state enable row level security;

insert into private.planner_state (owner_id)
select id
from public.profiles
on conflict (owner_id) do nothing;

create or replace function private.ensure_planner_state(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner is null then
    return;
  end if;

  insert into private.planner_state (owner_id)
  values (p_owner)
  on conflict (owner_id) do nothing;
end;
$$;

create or replace function private.bump_planner_canonical_revision(
  p_owner uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if p_owner is null then
    return null;
  end if;
  if pg_catalog.current_setting(
    'app.planner_deleting_profile_id',
    true
  ) = p_owner::text then
    return null;
  end if;

  insert into private.planner_state (
    owner_id,
    canonical_revision,
    execution_revision,
    updated_at
  )
  values (p_owner, 1, 0, pg_catalog.now())
  on conflict (owner_id) do update
  set canonical_revision =
        private.planner_state.canonical_revision + 1,
      updated_at = pg_catalog.now()
  returning canonical_revision into v_revision;

  return v_revision;
end;
$$;

create or replace function private.bump_planner_execution_revision(
  p_owner uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if p_owner is null then
    return null;
  end if;

  insert into private.planner_state (
    owner_id,
    canonical_revision,
    execution_revision,
    updated_at
  )
  values (p_owner, 0, 1, pg_catalog.now())
  on conflict (owner_id) do update
  set execution_revision =
        private.planner_state.execution_revision + 1,
      updated_at = pg_catalog.now()
  returning execution_revision into v_revision;

  return v_revision;
end;
$$;

create or replace function private.initialize_planner_state_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_planner_state(new.id);
  return new;
end;
$$;

create or replace function private.mark_profile_planner_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'app.planner_deleting_profile_id',
    old.id::text,
    true
  );
  return old;
end;
$$;

drop trigger if exists initialize_planner_state on public.profiles;
create trigger initialize_planner_state
after insert on public.profiles
for each row execute function private.initialize_planner_state_for_profile();

drop trigger if exists mark_profile_planner_deletion on public.profiles;
create trigger mark_profile_planner_deletion
before delete on public.profiles
for each row execute function private.mark_profile_planner_deletion();

create table public.planner_preferences (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null,
  default_policy jsonb not null,
  policy_schema_version text not null,
  policy_compiler_version text not null,
  policy_revision bigint not null default 1
    check (policy_revision >= 1),
  timezone_confirmed_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint planner_preferences_timezone_length
    check (pg_catalog.length(timezone) between 1 and 100),
  constraint planner_preferences_policy_schema_version
    check (policy_schema_version ~ '^[0-9]+$'),
  constraint planner_preferences_policy_compiler_version
    check (policy_compiler_version ~ '^[0-9]+$'),
  constraint planner_preferences_policy_shape
    check (
      pg_catalog.jsonb_typeof(default_policy) = 'object'
      and pg_catalog.octet_length(default_policy::text) <= 262144
      and default_policy->>'schemaVersion' = policy_schema_version
      and default_policy->>'timezone' = timezone
    )
);

create table public.execution_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  scope_month date not null,
  eligibility_mode text not null,
  timezone text not null,
  version integer not null,
  parent_plan_id uuid,
  status text not null default 'active',
  generation_source text not null,
  change_summary jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null,
  generation_input_hash text not null,
  observed_canonical_revision bigint not null,
  observed_execution_revision bigint not null,
  contract_version text not null,
  scheduler_version text not null,
  requirement_schema_version text not null,
  assessment_schema_version text not null,
  policy_schema_version text not null,
  policy_compiler_version text not null,
  prompt_version text,
  placement_status text not null,
  search_status text not null,
  capacity_status text not null,
  confirmation_required boolean not null,
  publishable boolean not null,
  idempotency_key uuid not null,
  request_digest text not null,
  created_at timestamptz not null default pg_catalog.now(),
  activated_at timestamptz not null default pg_catalog.now(),
  superseded_at timestamptz,
  dismissed_at timestamptz,
  constraint execution_plans_id_owner_unique unique (id, owner_id),
  constraint execution_plans_id_owner_scope_unique
    unique (id, owner_id, scope_month),
  constraint execution_plans_owner_scope_version_unique
    unique (owner_id, scope_month, version),
  constraint execution_plans_owner_idempotency_unique
    unique (owner_id, idempotency_key),
  constraint execution_plans_scope_is_month
    check (extract(day from scope_month) = 1),
  constraint execution_plans_eligibility_mode
    check (eligibility_mode = 'end_month_v1'),
  constraint execution_plans_timezone_length
    check (pg_catalog.length(timezone) between 1 and 100),
  constraint execution_plans_version_parent
    check (
      (version = 1 and parent_plan_id is null)
      or (version > 1 and parent_plan_id is not null)
    ),
  constraint execution_plans_status
    check (status in ('active', 'superseded', 'dismissed')),
  constraint execution_plans_status_timestamps
    check (
      (
        status = 'active'
        and superseded_at is null
        and dismissed_at is null
      )
      or (
        status = 'superseded'
        and superseded_at is not null
        and dismissed_at is null
      )
      or (
        status = 'dismissed'
        and dismissed_at is not null
        and superseded_at is null
      )
    ),
  constraint execution_plans_generation_source
    check (generation_source in ('manual', 'ai', 'update')),
  constraint execution_plans_ai_prompt_version
    check (generation_source <> 'ai' or prompt_version is not null),
  constraint execution_plans_change_summary_shape
    check (
      pg_catalog.jsonb_typeof(change_summary) = 'object'
      and pg_catalog.octet_length(change_summary::text) <= 262144
    ),
  constraint execution_plans_policy_shape
    check (
      pg_catalog.jsonb_typeof(policy_snapshot) = 'object'
      and pg_catalog.octet_length(policy_snapshot::text) <= 262144
      and policy_snapshot->>'schemaVersion' = policy_schema_version
      and policy_snapshot->>'timezone' = timezone
    ),
  constraint execution_plans_generation_hash
    check (generation_input_hash ~ '^[a-f0-9]{64}$'),
  constraint execution_plans_request_digest
    check (request_digest ~ '^[a-f0-9]{64}$'),
  constraint execution_plans_revisions
    check (
      observed_canonical_revision >= 0
      and observed_execution_revision >= 0
    ),
  constraint execution_plans_versions
    check (
      contract_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      and scheduler_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      and requirement_schema_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      and assessment_schema_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      and policy_schema_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      and policy_compiler_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      and (
        prompt_version is null
        or prompt_version ~ '^[a-zA-Z0-9._-]{1,100}$'
      )
    ),
  constraint execution_plans_placement_status
    check (placement_status in ('complete', 'partial')),
  constraint execution_plans_search_status
    check (
      search_status in (
        'all_units_placed',
        'maximum_partial',
        'blocked_invalid_lock',
        'soft_optimization_exhausted'
      )
    ),
  constraint execution_plans_capacity_status
    check (capacity_status = 'unverified'),
  constraint execution_plans_parent_scope_fkey
    foreign key (parent_plan_id, owner_id, scope_month)
    references public.execution_plans (id, owner_id, scope_month)
);

create unique index execution_plans_one_active_scope_idx
on public.execution_plans (owner_id, scope_month)
where status = 'active';

create index execution_plans_owner_created_idx
on public.execution_plans (owner_id, created_at desc);

create index execution_plans_parent_scope_idx
on public.execution_plans (parent_plan_id, owner_id, scope_month)
where parent_plan_id is not null;

create table public.execution_plan_goals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  owner_id uuid not null,
  goal_id uuid references public.goals(id) on delete set null,
  original_goal_id uuid not null,
  title text not null,
  category text not null,
  color text,
  start_date date not null,
  end_date date,
  requirement_kind text not null,
  requirement_fingerprint text not null,
  requirement_snapshot jsonb not null,
  assessment_snapshot jsonb not null,
  assessment_input_hash text not null,
  admissible_credit_basis jsonb not null,
  generation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint execution_plan_goals_id_plan_owner_unique
    unique (id, plan_id, owner_id),
  constraint execution_plan_goals_plan_original_unique
    unique (plan_id, original_goal_id),
  constraint execution_plan_goals_plan_owner_fkey
    foreign key (plan_id, owner_id)
    references public.execution_plans (id, owner_id)
    on delete cascade,
  constraint execution_plan_goals_dates
    check (end_date is null or end_date >= start_date),
  constraint execution_plan_goals_title
    check (pg_catalog.length(title) between 1 and 500),
  constraint execution_plan_goals_category
    check (pg_catalog.length(category) between 1 and 100),
  constraint execution_plan_goals_requirement_kind
    check (
      requirement_kind in (
        'milestone_sequence',
        'cadence',
        'deadline_total'
      )
    ),
  constraint execution_plan_goals_requirement_fingerprint
    check (requirement_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint execution_plan_goals_assessment_input_hash
    check (assessment_input_hash ~ '^[a-f0-9]{64}$'),
  constraint execution_plan_goals_requirement_shape
    check (
      pg_catalog.jsonb_typeof(requirement_snapshot) = 'object'
      and pg_catalog.octet_length(requirement_snapshot::text) <= 262144
    ),
  constraint execution_plan_goals_assessment_shape
    check (
      pg_catalog.jsonb_typeof(assessment_snapshot) = 'object'
      and pg_catalog.octet_length(assessment_snapshot::text) <= 262144
    ),
  constraint execution_plan_goals_credit_basis_shape
    check (
      pg_catalog.jsonb_typeof(admissible_credit_basis) = 'object'
      and pg_catalog.octet_length(admissible_credit_basis::text) <= 1048576
    ),
  constraint execution_plan_goals_summary_shape
    check (
      pg_catalog.jsonb_typeof(generation_summary) = 'object'
      and pg_catalog.octet_length(generation_summary::text) <= 262144
    )
);

create index execution_plan_goals_owner_idx
on public.execution_plan_goals (owner_id);

create index execution_plan_goals_plan_owner_idx
on public.execution_plan_goals (plan_id, owner_id);

create index execution_plan_goals_goal_idx
on public.execution_plan_goals (goal_id)
where goal_id is not null;

create table public.execution_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  owner_id uuid not null,
  scope_month date not null,
  date date not null,
  is_rest_day boolean not null default false,
  is_blocked boolean not null default false,
  preference_cost integer not null default 0,
  resolved_policy jsonb not null default '{}'::jsonb,
  generation_session_count integer not null default 0,
  generation_effort_minutes integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  constraint execution_plan_days_id_plan_owner_unique
    unique (id, plan_id, owner_id),
  constraint execution_plan_days_plan_date_unique unique (plan_id, date),
  constraint execution_plan_days_plan_owner_scope_fkey
    foreign key (plan_id, owner_id, scope_month)
    references public.execution_plans (id, owner_id, scope_month)
    on delete cascade,
  constraint execution_plan_days_scope
    check (
      extract(day from scope_month) = 1
      and date >= scope_month
      and date < (scope_month + interval '1 month')::date
    ),
  constraint execution_plan_days_counts
    check (
      preference_cost between 0 and 1000000
      and generation_session_count between 0 and 5000
      and generation_effort_minutes between 0 and 10000000
    ),
  constraint execution_plan_days_policy_shape
    check (
      pg_catalog.jsonb_typeof(resolved_policy) = 'object'
      and pg_catalog.octet_length(resolved_policy::text) <= 262144
    )
);

create index execution_plan_days_owner_date_idx
on public.execution_plan_days (owner_id, date);

create index execution_plan_days_plan_owner_scope_idx
on public.execution_plan_days (plan_id, owner_id, scope_month);

create table public.execution_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  owner_id uuid not null,
  plan_goal_id uuid not null,
  unit_key text not null,
  requirement_kind text not null,
  ordinal integer not null,
  period_key date,
  label text,
  credit_window_start date not null,
  credit_window_end date not null,
  placement_window_start date,
  placement_window_end date,
  classification text not null,
  miss_policy text not null,
  rest_eligible boolean not null,
  max_per_day integer not null default 1,
  credited_completion_id uuid,
  credited_completion_date date,
  credit_state text not null,
  original_scheduled_date date,
  scheduled_date date,
  locked boolean not null default false,
  locked_at timestamptz,
  estimated_minutes integer not null default 30,
  priority integer not null default 0,
  revision bigint not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint execution_plan_items_id_plan_owner_unique
    unique (id, plan_id, owner_id),
  constraint execution_plan_items_goal_unit_unique
    unique (plan_goal_id, unit_key),
  constraint execution_plan_items_plan_owner_fkey
    foreign key (plan_id, owner_id)
    references public.execution_plans (id, owner_id)
    on delete cascade,
  constraint execution_plan_items_goal_same_plan_fkey
    foreign key (plan_goal_id, plan_id, owner_id)
    references public.execution_plan_goals (id, plan_id, owner_id)
    on delete cascade,
  constraint execution_plan_items_scheduled_day_fkey
    foreign key (plan_id, scheduled_date)
    references public.execution_plan_days (plan_id, date),
  constraint execution_plan_items_unit_key
    check (pg_catalog.length(unit_key) between 1 and 100),
  constraint execution_plan_items_requirement_kind
    check (
      requirement_kind in (
        'milestone_sequence',
        'cadence',
        'deadline_total'
      )
    ),
  constraint execution_plan_items_ordinal
    check (ordinal between 1 and 5000),
  constraint execution_plan_items_label
    check (label is null or pg_catalog.length(label) <= 500),
  constraint execution_plan_items_credit_window
    check (credit_window_end >= credit_window_start),
  constraint execution_plan_items_placement_window
    check (
      (placement_window_start is null) =
        (placement_window_end is null)
      and (
        placement_window_start is null
        or placement_window_end >= placement_window_start
      )
    ),
  constraint execution_plan_items_classification
    check (
      classification in (
        'fulfilled',
        'open',
        'future',
        'historical_shortfall',
        'historical_miss',
        'satisfied_elsewhere'
      )
    ),
  constraint execution_plan_items_miss_policy
    check (miss_policy in ('roll_forward', 'remain_missed')),
  constraint execution_plan_items_max_per_day
    check (max_per_day = 1),
  constraint execution_plan_items_credit_state
    check (
      credit_state in (
        'uncredited',
        'completed_as_scheduled',
        'completed_elsewhere'
      )
      and (
        (
          credit_state = 'uncredited'
          and credited_completion_id is null
          and credited_completion_date is null
        )
        or (
          credit_state <> 'uncredited'
          and credited_completion_id is not null
          and credited_completion_date is not null
        )
      )
    ),
  constraint execution_plan_items_original_date_window
    check (
      original_scheduled_date is null
      or (
        placement_window_start is not null
        and original_scheduled_date between
          placement_window_start and placement_window_end
      )
    ),
  constraint execution_plan_items_scheduled_date_window
    check (
      scheduled_date is null
      or (
        placement_window_start is not null
        and scheduled_date between
          placement_window_start and placement_window_end
      )
    ),
  constraint execution_plan_items_lock_metadata
    check (
      (locked and locked_at is not null)
      or (not locked and locked_at is null)
    ),
  constraint execution_plan_items_counters
    check (
      estimated_minutes between 0 and 100000
      and priority between 0 and 1000000
      and revision >= 0
    )
);

create unique index execution_plan_items_goal_date_unique
on public.execution_plan_items (plan_goal_id, scheduled_date)
where scheduled_date is not null;

create index execution_plan_items_plan_date_idx
on public.execution_plan_items (plan_id, scheduled_date);

create index execution_plan_items_owner_date_idx
on public.execution_plan_items (owner_id, scheduled_date);

create index execution_plan_items_plan_owner_idx
on public.execution_plan_items (plan_id, owner_id);

create index execution_plan_items_goal_same_plan_idx
on public.execution_plan_items (plan_goal_id, plan_id, owner_id);

create index execution_plan_items_credited_completion_idx
on public.execution_plan_items (credited_completion_id)
where credited_completion_id is not null;

create table public.execution_plan_issues (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  owner_id uuid not null,
  plan_goal_id uuid,
  item_id uuid,
  issue_code text not null,
  severity text not null default 'informational',
  unit_key text,
  details jsonb not null default '{}'::jsonb,
  relaxation jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint execution_plan_issues_plan_owner_fkey
    foreign key (plan_id, owner_id)
    references public.execution_plans (id, owner_id)
    on delete cascade,
  constraint execution_plan_issues_goal_same_plan_fkey
    foreign key (plan_goal_id, plan_id, owner_id)
    references public.execution_plan_goals (id, plan_id, owner_id)
    on delete cascade,
  constraint execution_plan_issues_item_same_plan_fkey
    foreign key (item_id, plan_id, owner_id)
    references public.execution_plan_items (id, plan_id, owner_id)
    on delete cascade,
  constraint execution_plan_issues_code
    check (
      issue_code in (
        'placement_shortfall',
        'invalid_lock',
        'soft_optimization_exhausted',
        'historical_miss',
        'historical_shortfall',
        'inadmissible',
        'out_of_plan',
        'credited_work_removed',
        'credited_work_reassigned',
        'overdue_item',
        'goal_changed',
        'policy_changed',
        'timezone_changed',
        'link_changed',
        'orphaned_goal',
        'relaxation_suggested'
      )
    ),
  constraint execution_plan_issues_severity
    check (severity in ('informational', 'warning', 'blocking')),
  constraint execution_plan_issues_unit_key
    check (unit_key is null or pg_catalog.length(unit_key) <= 100),
  constraint execution_plan_issues_details_shape
    check (
      pg_catalog.jsonb_typeof(details) = 'object'
      and pg_catalog.octet_length(details::text) <= 262144
    ),
  constraint execution_plan_issues_relaxation_shape
    check (
      relaxation is null
      or (
        pg_catalog.jsonb_typeof(relaxation) = 'object'
        and pg_catalog.octet_length(relaxation::text) <= 262144
      )
    ),
  constraint execution_plan_issues_scope
    check (plan_goal_id is not null or item_id is null)
);

create index execution_plan_issues_owner_idx
on public.execution_plan_issues (owner_id);

create index execution_plan_issues_plan_owner_idx
on public.execution_plan_issues (plan_id, owner_id);

create index execution_plan_issues_goal_same_plan_idx
on public.execution_plan_issues (plan_goal_id, plan_id, owner_id);

create index execution_plan_issues_item_same_plan_idx
on public.execution_plan_issues (item_id, plan_id, owner_id);

create or replace function private.prepare_planner_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  v_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  perform pg_catalog.pg_advisory_xact_lock(
    private.planner_owner_lock_key(v_owner)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  if not private.is_valid_planner_timezone(new.timezone) then
    raise exception using
      errcode = '22023',
      message = 'invalid planner timezone';
  end if;

  if not private.validate_planner_json(
    new.default_policy,
    'object',
    262144,
    16
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid planner policy';
  end if;

  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id then
      raise exception using
        errcode = '23514',
        message = 'planner preference owner is immutable';
    end if;

    if (
      new.timezone,
      new.default_policy,
      new.policy_schema_version,
      new.policy_compiler_version,
      new.timezone_confirmed_at
    ) is distinct from (
      old.timezone,
      old.default_policy,
      old.policy_schema_version,
      old.policy_compiler_version,
      old.timezone_confirmed_at
    ) then
      new.policy_revision := old.policy_revision + 1;
      new.updated_at := pg_catalog.now();
    else
      new.policy_revision := old.policy_revision;
      new.updated_at := old.updated_at;
    end if;
  else
    new.policy_revision := 1;
    new.created_at := pg_catalog.now();
    new.updated_at := new.created_at;
  end if;

  return new;
end;
$$;

create or replace function private.validate_execution_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' or not new.publishable then
    raise exception using
      errcode = '23514',
      message = 'only publishable active plans may be inserted';
  end if;

  if not private.is_valid_planner_timezone(new.timezone) then
    raise exception using
      errcode = '22023',
      message = 'invalid execution plan timezone';
  end if;

  if not private.validate_planner_json(
    new.change_summary,
    'object',
    262144,
    16
  ) or not private.validate_planner_json(
    new.policy_snapshot,
    'object',
    262144,
    16
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid execution plan JSON';
  end if;

  return new;
end;
$$;

create or replace function private.derive_execution_plan_goal_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal_owner uuid;
begin
  if new.goal_id is null then
    raise exception using
      errcode = '23502',
      message = 'live goal is required when publishing a plan snapshot';
  end if;

  select owner_id
  into v_goal_owner
  from public.goals
  where id = new.goal_id
  for key share;

  if v_goal_owner is null or v_goal_owner <> new.owner_id then
    raise exception using
      errcode = '23503',
      message = 'plan goal must reference a live goal owned by the plan owner';
  end if;

  if new.original_goal_id is not null
    and new.original_goal_id <> new.goal_id then
    raise exception using
      errcode = '23514',
      message = 'original goal identity is database-derived';
  end if;

  new.original_goal_id := new.goal_id;
  return new;
end;
$$;

create or replace function private.guard_execution_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1
      and pg_catalog.current_setting(
        'app.planner_deleting_profile_id',
        true
      ) = old.owner_id::text then
      return old;
    end if;
    raise exception using
      errcode = '55000',
      message = 'execution plan history cannot be deleted';
  end if;

  if old.status <> 'active'
    or new.status not in ('superseded', 'dismissed')
    or new.status = old.status then
    raise exception using
      errcode = '55000',
      message = 'invalid execution plan status transition';
  end if;

  if (
    pg_catalog.to_jsonb(new)
      - array['status', 'superseded_at', 'dismissed_at']::text[]
  ) is distinct from (
    pg_catalog.to_jsonb(old)
      - array['status', 'superseded_at', 'dismissed_at']::text[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'execution plan snapshot is immutable';
  end if;

  if new.status = 'superseded' then
    new.superseded_at := coalesce(
      new.superseded_at,
      pg_catalog.now()
    );
    new.dismissed_at := null;
  else
    new.dismissed_at := coalesce(
      new.dismissed_at,
      pg_catalog.now()
    );
    new.superseded_at := null;
  end if;

  return new;
end;
$$;

create or replace function private.guard_execution_plan_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception using
      errcode = '55000',
      message = 'execution plan goal snapshots cannot be deleted';
  end if;

  if old.goal_id is not null
    and new.goal_id is null
    and old.goal_id::text = any(
      pg_catalog.string_to_array(
        pg_catalog.current_setting(
          'app.planner_deleting_goal_ids',
          true
        ),
        ','
      )
    )
    and (
      pg_catalog.to_jsonb(new) - 'goal_id'
    ) = (
      pg_catalog.to_jsonb(old) - 'goal_id'
    ) then
    return new;
  end if;

  raise exception using
    errcode = '55000',
    message = 'execution plan goal snapshots are immutable';
end;
$$;

create or replace function private.guard_immutable_execution_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and pg_catalog.pg_trigger_depth() > 1
    and pg_catalog.current_setting(
      'app.planner_deleting_profile_id',
      true
    ) = old.owner_id::text then
    return old;
  end if;

  raise exception using
    errcode = '55000',
    message = tg_table_name || ' snapshots are immutable';
end;
$$;

create or replace function private.guard_execution_plan_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_status text;
begin
  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1
      and pg_catalog.current_setting(
        'app.planner_deleting_profile_id',
        true
      ) = old.owner_id::text then
      return old;
    end if;
    raise exception using
      errcode = '55000',
      message = 'execution plan items cannot be deleted';
  end if;

  if (
    pg_catalog.to_jsonb(new)
      - array[
          'scheduled_date',
          'locked',
          'locked_at',
          'revision',
          'updated_at'
        ]::text[]
  ) is distinct from (
    pg_catalog.to_jsonb(old)
      - array[
          'scheduled_date',
          'locked',
          'locked_at',
          'revision',
          'updated_at'
        ]::text[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'execution plan item obligation state is immutable';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception using
      errcode = '40001',
      message = 'execution plan item revision must increment exactly once';
  end if;

  if new.scheduled_date is distinct from old.scheduled_date
    and not new.locked then
    raise exception using
      errcode = '23514',
      message = 'moving an execution plan item must lock it';
  end if;

  select status
  into v_plan_status
  from public.execution_plans
  where id = old.plan_id
  for update;

  if v_plan_status <> 'active' then
    raise exception using
      errcode = '55000',
      message = 'only active plan items may change';
  end if;

  new.updated_at := pg_catalog.now();
  new.locked_at := case
    when new.locked then coalesce(new.locked_at, pg_catalog.now())
    else null
  end;

  return new;
end;
$$;

create trigger prepare_planner_preferences
before insert or update or delete on public.planner_preferences
for each row execute function private.prepare_planner_preferences();

create trigger validate_execution_plan
before insert on public.execution_plans
for each row execute function private.validate_execution_plan();

create trigger guard_execution_plan
before update or delete on public.execution_plans
for each row execute function private.guard_execution_plan();

create trigger derive_execution_plan_goal_identity
before insert on public.execution_plan_goals
for each row execute function private.derive_execution_plan_goal_identity();

create trigger guard_execution_plan_goal
before update or delete on public.execution_plan_goals
for each row execute function private.guard_execution_plan_goal();

create trigger guard_execution_plan_day
before update or delete on public.execution_plan_days
for each row execute function private.guard_immutable_execution_snapshot();

create trigger guard_execution_plan_item
before update or delete on public.execution_plan_items
for each row execute function private.guard_execution_plan_item();

create trigger guard_execution_plan_issue
before update or delete on public.execution_plan_issues
for each row execute function private.guard_immutable_execution_snapshot();

create or replace function private.bump_canonical_for_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bump_planner_canonical_revision(
    case when tg_op = 'DELETE' then old.owner_id else new.owner_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.bump_canonical_for_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform pg_catalog.set_config(
      'app.planner_deleting_goal_ids',
      case
        when pg_catalog.current_setting(
          'app.planner_deleting_goal_ids',
          true
        ) is null then old.id::text
        else pg_catalog.current_setting(
          'app.planner_deleting_goal_ids',
          true
        ) || ',' || old.id::text
      end,
      true
    );
    perform private.bump_planner_canonical_revision(old.owner_id);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform private.bump_planner_canonical_revision(new.owner_id);
    return new;
  end if;

  if (
    new.owner_id,
    new.title,
    new.description,
    new.category,
    new.color,
    new.frequency_type,
    new.recurrence_interval,
    new.target_count,
    new.milestone_names,
    new.start_date,
    new.end_date,
    new.is_group,
    new.is_deleted,
    new.archived_at
  ) is distinct from (
    old.owner_id,
    old.title,
    old.description,
    old.category,
    old.color,
    old.frequency_type,
    old.recurrence_interval,
    old.target_count,
    old.milestone_names,
    old.start_date,
    old.end_date,
    old.is_group,
    old.is_deleted,
    old.archived_at
  ) then
    perform private.bump_planner_canonical_revision(old.owner_id);
    if new.owner_id <> old.owner_id then
      perform private.bump_planner_canonical_revision(new.owner_id);
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.bump_canonical_for_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_owner uuid;
  v_new_owner uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select owner_id
    into v_old_owner
    from public.goals
    where id = old.goal_id
      and not is_group;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select owner_id
    into v_new_owner
    from public.goals
    where id = new.goal_id
      and not is_group;
  end if;

  perform private.bump_planner_canonical_revision(v_old_owner);
  if v_new_owner is distinct from v_old_owner then
    perform private.bump_planner_canonical_revision(v_new_owner);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.bump_canonical_for_goal_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.bump_planner_canonical_revision(old.owner_id);
  end if;
  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.owner_id <> old.owner_id) then
    perform private.bump_planner_canonical_revision(new.owner_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists planner_preferences_canonical_revision
on public.planner_preferences;
create trigger planner_preferences_canonical_revision
after insert or update or delete on public.planner_preferences
for each row execute function private.bump_canonical_for_preferences();

drop trigger if exists goals_planner_canonical_revision on public.goals;
create trigger goals_planner_canonical_revision
after insert or update on public.goals
for each row execute function private.bump_canonical_for_goal();

drop trigger if exists goals_planner_canonical_revision_before_delete
on public.goals;
create trigger goals_planner_canonical_revision_before_delete
before delete on public.goals
for each row execute function private.bump_canonical_for_goal();

drop trigger if exists completions_planner_canonical_revision
on public.completions;
create trigger completions_planner_canonical_revision
after insert or update or delete on public.completions
for each row execute function private.bump_canonical_for_completion();

drop trigger if exists goal_links_planner_canonical_revision
on public.goal_links;
create trigger goal_links_planner_canonical_revision
after insert or update or delete on public.goal_links
for each row execute function private.bump_canonical_for_goal_link();

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

  if v_source_owner <> new.owner_id
    or v_target_owner <> new.owner_id then
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
    from public.execution_plans plan
    join public.execution_plan_goals plan_goal
      on plan_goal.plan_id = plan.id
    where plan.owner_id = new.owner_id
      and plan.status = 'active'
      and plan_goal.original_goal_id in (
        new.source_goal_id,
        new.target_goal_id
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'goals in an active execution plan cannot be linked';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_goal_link on public.goal_links;
drop function if exists public.validate_goal_link();

create trigger validate_goal_link
before insert or update on public.goal_links
for each row execute function private.validate_goal_link_for_planner();

create or replace function public.get_planner_state()
returns table (
  canonical_revision bigint,
  execution_revision bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  if v_owner is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  return query
  select state.canonical_revision, state.execution_revision
  from private.planner_state state
  where state.owner_id = v_owner;
end;
$$;

alter table public.planner_preferences enable row level security;
alter table public.execution_plans enable row level security;
alter table public.execution_plan_goals enable row level security;
alter table public.execution_plan_days enable row level security;
alter table public.execution_plan_items enable row level security;
alter table public.execution_plan_issues enable row level security;

create policy planner_preferences_owner_select
on public.planner_preferences
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy execution_plans_owner_select
on public.execution_plans
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy execution_plan_goals_owner_select
on public.execution_plan_goals
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy execution_plan_days_owner_select
on public.execution_plan_days
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy execution_plan_items_owner_select
on public.execution_plan_items
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy execution_plan_issues_owner_select
on public.execution_plan_issues
for select
to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.planner_preferences from public, anon, authenticated;
revoke all on table public.execution_plans from public, anon, authenticated;
revoke all on table public.execution_plan_goals from public, anon, authenticated;
revoke all on table public.execution_plan_days from public, anon, authenticated;
revoke all on table public.execution_plan_items from public, anon, authenticated;
revoke all on table public.execution_plan_issues from public, anon, authenticated;

grant select on table public.planner_preferences to authenticated;
grant select on table public.execution_plans to authenticated;
grant select on table public.execution_plan_goals to authenticated;
grant select on table public.execution_plan_days to authenticated;
grant select on table public.execution_plan_items to authenticated;
grant select on table public.execution_plan_issues to authenticated;

revoke all on table public.planner_preferences from service_role;
revoke all on table public.execution_plans from service_role;
revoke all on table public.execution_plan_goals from service_role;
revoke all on table public.execution_plan_days from service_role;
revoke all on table public.execution_plan_items from service_role;
revoke all on table public.execution_plan_issues from service_role;
grant select on table public.planner_preferences to service_role;
grant select on table public.execution_plans to service_role;
grant select on table public.execution_plan_goals to service_role;
grant select on table public.execution_plan_days to service_role;
grant select on table public.execution_plan_items to service_role;
grant select on table public.execution_plan_issues to service_role;
revoke all on table private.planner_state from service_role;
grant select on table private.planner_state to service_role;

revoke execute on function public.get_planner_state() from public;
revoke execute on function public.get_planner_state() from anon;
grant execute on function public.get_planner_state() to authenticated;

revoke execute on all functions in schema private
from public, anon, authenticated;
alter default privileges in schema private
revoke execute on functions from public;

revoke execute on function private.planner_owner_lock_key(uuid) from public;
revoke execute on function private.is_valid_planner_timezone(text) from public;
revoke execute on function private.planner_json_depth(jsonb) from public;
revoke execute on function private.validate_planner_json(
  jsonb,
  text,
  integer,
  integer
) from public;
revoke execute on function private.ensure_planner_state(uuid) from public;
revoke execute on function private.bump_planner_canonical_revision(uuid)
from public;
revoke execute on function private.bump_planner_execution_revision(uuid)
from public;

grant execute on function private.planner_owner_lock_key(uuid)
to service_role;
grant execute on function private.is_valid_planner_timezone(text)
to service_role;
grant execute on function private.planner_json_depth(jsonb)
to service_role;
grant execute on function private.validate_planner_json(
  jsonb,
  text,
  integer,
  integer
) to service_role;
grant execute on function private.bump_planner_execution_revision(uuid)
to service_role;
