-- Integrations UX: auto-complete opt-in rules, provider disconnect with
-- re-election, and a guarded apply path that never returns raw health values.

create table if not exists public.health_autocomplete_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  metric_key public.health_metric_key not null,
  threshold_numeric numeric not null,
  enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.timezone('utc', now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', now()),
  constraint health_autocomplete_rules_threshold_range check (
    threshold_numeric >= 0
    and threshold_numeric <= 1000000000
  ),
  constraint health_autocomplete_rules_unique unique (user_id, goal_id, metric_key)
);

drop trigger if exists set_health_autocomplete_rules_updated_at
  on public.health_autocomplete_rules;
create trigger set_health_autocomplete_rules_updated_at
before update on public.health_autocomplete_rules
for each row execute function public.set_updated_at();

alter table public.health_autocomplete_rules enable row level security;

drop policy if exists health_autocomplete_rules_select_self
  on public.health_autocomplete_rules;
create policy health_autocomplete_rules_select_self
on public.health_autocomplete_rules
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.health_autocomplete_rules from anon, authenticated;
grant select on table public.health_autocomplete_rules to authenticated;

create or replace function public.upsert_health_autocomplete_rule_service(
  p_goal_id uuid,
  p_metric_key public.health_metric_key,
  p_threshold_numeric numeric,
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.health_autocomplete_rules;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_goal_id is null or p_metric_key is null or p_threshold_numeric is null then
    raise exception using errcode = '22023', message = 'invalid_autocomplete_rule';
  end if;

  if not public.can_complete_goal(p_goal_id, v_uid) then
    raise exception using errcode = '42501', message = 'not_authorized_for_goal';
  end if;

  insert into public.health_autocomplete_rules (
    user_id,
    goal_id,
    metric_key,
    threshold_numeric,
    enabled
  )
  values (
    v_uid,
    p_goal_id,
    p_metric_key,
    p_threshold_numeric,
    coalesce(p_enabled, true)
  )
  on conflict (user_id, goal_id, metric_key)
  do update set
    threshold_numeric = excluded.threshold_numeric,
    enabled = excluded.enabled
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'goal_id', v_row.goal_id,
    'metric_key', v_row.metric_key,
    'threshold_numeric', v_row.threshold_numeric,
    'enabled', v_row.enabled
  );
end;
$$;

revoke all on function public.upsert_health_autocomplete_rule_service(
  uuid,
  public.health_metric_key,
  numeric,
  boolean
) from public, anon;
grant execute on function public.upsert_health_autocomplete_rule_service(
  uuid,
  public.health_metric_key,
  numeric,
  boolean
) to authenticated, service_role;

create or replace function public.delete_health_autocomplete_rule_service(
  p_rule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_rule_id is null then
    raise exception using errcode = '22023', message = 'invalid_autocomplete_rule';
  end if;

  delete from public.health_autocomplete_rules
  where id = p_rule_id
    and user_id = v_uid;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_health_autocomplete_rule_service(uuid)
  from public, anon;
grant execute on function public.delete_health_autocomplete_rule_service(uuid)
  to authenticated, service_role;

create or replace function public.apply_health_autocomplete_service(
  p_local_today date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rule record;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_inserted boolean;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_local_today is null then
    raise exception using errcode = '22023', message = 'invalid_local_today';
  end if;

  for v_rule in
    select
      rule.goal_id,
      rule.metric_key,
      metrics.local_date
    from public.health_autocomplete_rules as rule
    join public.health_daily_metrics as metrics
      on metrics.user_id = rule.user_id
      and metrics.metric_key = rule.metric_key
      and metrics.local_date in (p_local_today, p_local_today - 1)
    where rule.user_id = v_uid
      and rule.enabled
      and metrics.value_numeric >= rule.threshold_numeric
  loop
    v_inserted := public.apply_external_completion_service(
      v_rule.goal_id,
      v_rule.local_date,
      p_local_today,
      'health:'
        || v_rule.metric_key::text
        || ':'
        || v_rule.local_date::text
        || ':'
        || v_rule.goal_id::text
    );
    if v_inserted then
      v_applied := v_applied + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'applied_count', v_applied,
    'skipped_count', v_skipped
  );
end;
$$;

revoke all on function public.apply_health_autocomplete_service(date)
  from public, anon;
grant execute on function public.apply_health_autocomplete_service(date)
  to authenticated, service_role;

create or replace function public.disconnect_health_provider_service(
  p_provider public.health_provider
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
  v_from date;
  v_to date;
  v_affected jsonb := '[]'::jsonb;
  v_pair jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_provider is null then
    raise exception using errcode = '22023', message = 'invalid_health_provider';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(private.health_ingest_lock_key(v_uid));

  select min(activity.local_date), max(activity.local_date)
  into v_from, v_to
  from public.health_activities as activity
  where activity.user_id = v_uid
    and activity.provider = p_provider;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'local_date', affected.local_date,
          'metric_key', affected.metric_key
        )
      )
      from (
        select distinct activity.local_date, activity.metric_key
        from public.health_activities as activity
        where activity.user_id = v_uid
          and activity.provider = p_provider
      ) as affected
    ),
    '[]'::jsonb
  )
  into v_affected;

  delete from public.health_activities
  where user_id = v_uid
    and provider = p_provider;

  get diagnostics v_deleted = row_count;

  for v_pair in
    select value
    from pg_catalog.jsonb_array_elements(v_affected) as pairs(value)
  loop
    perform private.elect_health_activities_for_key(
      v_uid,
      (v_pair->>'local_date')::date,
      (v_pair->>'metric_key')::public.health_metric_key
    );
  end loop;

  if v_from is not null then
    perform private.recompute_health_daily_metrics_for_user(v_uid, v_from, v_to);
  end if;

  delete from public.health_activity_groups as grp
  where grp.user_id = v_uid
    and not exists (
      select 1
      from public.health_activities as activity
      where activity.group_id = grp.id
    );

  delete from public.health_sync_state
  where user_id = v_uid
    and provider = p_provider;

  return jsonb_build_object(
    'deleted_count', v_deleted,
    'recomputed_days', case
      when v_from is null then 0
      else (v_to - v_from) + 1
    end
  );
end;
$$;

revoke all on function public.disconnect_health_provider_service(public.health_provider)
  from public, anon;
grant execute on function public.disconnect_health_provider_service(public.health_provider)
  to authenticated, service_role;
