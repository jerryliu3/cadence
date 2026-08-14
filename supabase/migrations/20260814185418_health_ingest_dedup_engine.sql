-- Wave 1 health ingest: native upsert, source-priority exclusion, fuzzy
-- grouping, canonical election, and canonical-only daily rollups.

create or replace function private.health_ingest_lock_key(p_user_id uuid)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    'resolution.health.ingest.v1:' || p_user_id::text,
    872314001
  );
$$;

revoke all on function private.health_ingest_lock_key(uuid) from public, anon, authenticated;
grant execute on function private.health_ingest_lock_key(uuid) to service_role;

create or replace function private.health_source_priority_rank(
  p_user_id uuid,
  p_metric public.health_metric_key,
  p_source_identifier text
)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select priority.priority
      from public.health_source_priority as priority
      where priority.user_id = p_user_id
        and priority.metric_key = p_metric
        and priority.source_identifier = p_source_identifier
    ),
    100
  );
$$;

revoke all on function private.health_source_priority_rank(
  uuid,
  public.health_metric_key,
  text
) from public, anon, authenticated;
grant execute on function private.health_source_priority_rank(
  uuid,
  public.health_metric_key,
  text
) to service_role;

-- Half-open ranges so abutting quantity buckets (15-minute steps) do not
-- count as overlap. Keep in sync with HEALTH_UTC_OFFSET envelope + lookback
-- in packages/shared/src/health/sync-window.ts.
create or replace function private.health_ranges_overlap(
  p_start_a timestamptz,
  p_end_a timestamptz,
  p_start_b timestamptz,
  p_end_b timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    tstzrange(p_start_a, coalesce(p_end_a, p_start_a), '[)')
    && tstzrange(p_start_b, coalesce(p_end_b, p_start_b), '[)');
$$;

revoke all on function private.health_ranges_overlap(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.health_ranges_overlap(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;

create or replace function private.health_samples_overlap(
  p_start_a timestamptz,
  p_end_a timestamptz,
  p_start_b timestamptz,
  p_end_b timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    private.health_ranges_overlap(p_start_a, p_end_a, p_start_b, p_end_b)
    or pg_catalog.abs(
      pg_catalog.extract('epoch', p_start_a - p_start_b)
    ) <= 600;
$$;

revoke all on function private.health_samples_overlap(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function private.health_samples_overlap(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) to service_role;

create or replace function private.health_metric_uses_fuzzy_cluster(
  p_metric public.health_metric_key
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_metric = 'workout_duration_minutes'::public.health_metric_key;
$$;

revoke all on function private.health_metric_uses_fuzzy_cluster(
  public.health_metric_key
) from public, anon, authenticated;
grant execute on function private.health_metric_uses_fuzzy_cluster(
  public.health_metric_key
) to service_role;

create or replace function private.health_utc_offset_envelope_dates()
returns table(min_date date, max_date date)
language sql
stable
set search_path = ''
as $$
  select
    (pg_catalog.timezone('utc', now()) - interval '14 hours')::date,
    (pg_catalog.timezone('utc', now()) + interval '14 hours')::date;
$$;

revoke all on function private.health_utc_offset_envelope_dates()
  from public, anon, authenticated;
grant execute on function private.health_utc_offset_envelope_dates()
  to service_role;

create or replace function private.assert_health_local_today(p_local_today date)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_min date;
  v_max date;
begin
  if p_local_today is null then
    raise exception using errcode = '22023', message = 'invalid_local_today';
  end if;

  select envelope.min_date, envelope.max_date
  into v_min, v_max
  from private.health_utc_offset_envelope_dates() as envelope;

  if p_local_today < v_min or p_local_today > v_max then
    raise exception using errcode = '22023', message = 'local_today_out_of_range';
  end if;
end;
$$;

revoke all on function private.assert_health_local_today(date)
  from public, anon, authenticated;
grant execute on function private.assert_health_local_today(date)
  to service_role;

create or replace function private.finalize_health_activity_cluster(
  p_user_id uuid,
  p_metric public.health_metric_key,
  p_local_date date,
  p_activity_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_winner_id uuid;
begin
  if p_activity_ids is null or pg_catalog.array_length(p_activity_ids, 1) is null then
    return;
  end if;

  if pg_catalog.array_length(p_activity_ids, 1) = 1 then
    update public.health_activities
    set
      group_id = null,
      is_canonical = true,
      suppressed_reason = null
    where id = p_activity_ids[1]
      and user_id = p_user_id;
    return;
  end if;

  insert into public.health_activity_groups (user_id, metric_key, local_date)
  values (p_user_id, p_metric, p_local_date)
  returning id into v_group_id;

  select activity.id
  into v_winner_id
  from public.health_activities as activity
  where activity.id = any (p_activity_ids)
    and activity.user_id = p_user_id
  order by
    private.health_source_priority_rank(
      activity.user_id,
      activity.metric_key,
      activity.source_identifier
    ) asc,
    activity.value_numeric desc,
    activity.started_at asc,
    activity.id asc
  limit 1;

  update public.health_activities as activity
  set
    group_id = v_group_id,
    is_canonical = (activity.id = v_winner_id),
    suppressed_reason = case
      when activity.id = v_winner_id then null
      else 'fuzzy_overlap'
    end
  where activity.id = any (p_activity_ids)
    and activity.user_id = p_user_id;
end;
$$;

revoke all on function private.finalize_health_activity_cluster(
  uuid,
  public.health_metric_key,
  date,
  uuid[]
) from public, anon, authenticated;
grant execute on function private.finalize_health_activity_cluster(
  uuid,
  public.health_metric_key,
  date,
  uuid[]
) to service_role;

create or replace function private.elect_health_activities_for_key(
  p_user_id uuid,
  p_local_date date,
  p_metric public.health_metric_key
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_cluster_ids uuid[] := '{}'::uuid[];
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_use_fuzzy boolean := private.health_metric_uses_fuzzy_cluster(p_metric);
begin
  update public.health_activities
  set
    group_id = null,
    is_canonical = true,
    suppressed_reason = null
  where user_id = p_user_id
    and local_date = p_local_date
    and metric_key = p_metric
    and coalesce(suppressed_reason, '') is distinct from 'disconnected';

  update public.health_activities as loser
  set
    is_canonical = false,
    suppressed_reason = 'source_priority'
  from public.health_activities as winner
  where loser.user_id = p_user_id
    and winner.user_id = p_user_id
    and loser.local_date = p_local_date
    and winner.local_date = p_local_date
    and loser.metric_key = p_metric
    and winner.metric_key = p_metric
    and loser.id <> winner.id
    and coalesce(loser.suppressed_reason, '') is distinct from 'disconnected'
    and coalesce(winner.suppressed_reason, '') is distinct from 'disconnected'
    and case
      when v_use_fuzzy then
        private.health_samples_overlap(
          winner.started_at,
          winner.ended_at,
          loser.started_at,
          loser.ended_at
        )
      else
        private.health_ranges_overlap(
          winner.started_at,
          winner.ended_at,
          loser.started_at,
          loser.ended_at
        )
    end
    and private.health_source_priority_rank(
      loser.user_id,
      loser.metric_key,
      loser.source_identifier
    ) > private.health_source_priority_rank(
      winner.user_id,
      winner.metric_key,
      winner.source_identifier
    );

  if v_use_fuzzy then
  for r in
    select
      activity.id,
      activity.started_at,
      coalesce(activity.ended_at, activity.started_at) as ended_at
    from public.health_activities as activity
    where activity.user_id = p_user_id
      and activity.local_date = p_local_date
      and activity.metric_key = p_metric
      and activity.is_canonical
    order by activity.started_at, activity.id
  loop
    if v_prev_start is null
      or private.health_samples_overlap(
        v_prev_start,
        v_prev_end,
        r.started_at,
        r.ended_at
      )
    then
      v_cluster_ids := array_append(v_cluster_ids, r.id);
    else
      perform private.finalize_health_activity_cluster(
        p_user_id,
        p_metric,
        p_local_date,
        v_cluster_ids
      );
      v_cluster_ids := array[r.id];
    end if;
    v_prev_start := r.started_at;
    v_prev_end := r.ended_at;
  end loop;

  if pg_catalog.array_length(v_cluster_ids, 1) is not null then
    perform private.finalize_health_activity_cluster(
      p_user_id,
      p_metric,
      p_local_date,
      v_cluster_ids
    );
  end if;
  end if;

  delete from public.health_activity_groups as grp
  where grp.user_id = p_user_id
    and grp.local_date = p_local_date
    and grp.metric_key = p_metric
    and not exists (
      select 1
      from public.health_activities as activity
      where activity.group_id = grp.id
    );
end;
$$;

revoke all on function private.elect_health_activities_for_key(
  uuid,
  date,
  public.health_metric_key
) from public, anon, authenticated;
grant execute on function private.elect_health_activities_for_key(
  uuid,
  date,
  public.health_metric_key
) to service_role;

create or replace function private.recompute_health_daily_metrics_for_user(
  p_user_id uuid,
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = '22023', message = 'invalid_health_metric_range';
  end if;

  insert into public.health_daily_metrics (
    user_id,
    local_date,
    metric_key,
    value_numeric,
    canonical_activity_count
  )
  select
    p_user_id,
    activity.local_date,
    activity.metric_key,
    coalesce(pg_catalog.sum(activity.value_numeric), 0),
    pg_catalog.count(*)::integer
  from public.health_activities as activity
  where activity.user_id = p_user_id
    and activity.local_date between p_from and p_to
    and activity.is_canonical
  group by activity.local_date, activity.metric_key
  on conflict (user_id, local_date, metric_key)
  do update set
    value_numeric = excluded.value_numeric,
    canonical_activity_count = excluded.canonical_activity_count;

  get diagnostics v_rows = row_count;

  delete from public.health_daily_metrics as metrics
  where metrics.user_id = p_user_id
    and metrics.local_date between p_from and p_to
    and not exists (
      select 1
      from public.health_activities as activity
      where activity.user_id = metrics.user_id
        and activity.local_date = metrics.local_date
        and activity.metric_key = metrics.metric_key
        and activity.is_canonical
    );

  return v_rows;
end;
$$;

revoke all on function private.recompute_health_daily_metrics_for_user(uuid, date, date)
  from public, anon, authenticated;
grant execute on function private.recompute_health_daily_metrics_for_user(uuid, date, date)
  to service_role;

create or replace function public.recompute_health_daily_metrics_service(
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(private.health_ingest_lock_key(v_uid));
  return private.recompute_health_daily_metrics_for_user(v_uid, p_from, p_to);
end;
$$;

revoke all on function public.recompute_health_daily_metrics_service(date, date)
  from public, anon;
grant execute on function public.recompute_health_daily_metrics_service(date, date)
  to authenticated, service_role;

drop function if exists public.ingest_health_activities_service(jsonb);

create or replace function public.ingest_health_activities_service(
  p_samples jsonb,
  p_deleted_native_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sample jsonb;
  v_deleted jsonb;
  v_ingested integer := 0;
  v_skipped integer := 0;
  v_deleted_count integer := 0;
  v_from date;
  v_to date;
  v_keys record;
  v_key_set jsonb := '[]'::jsonb;
  v_local_date date;
  v_ingest_min date;
  v_ingest_max date;
  v_started_at timestamptz;
  v_offset integer;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if p_samples is null or jsonb_typeof(p_samples) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_health_samples';
  end if;

  if p_deleted_native_ids is null or jsonb_typeof(p_deleted_native_ids) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_health_deletions';
  end if;

  if pg_catalog.jsonb_array_length(p_samples) > 500 then
    raise exception using errcode = '22023', message = 'health_sample_batch_too_large';
  end if;

  if pg_catalog.jsonb_array_length(p_deleted_native_ids) > 500 then
    raise exception using errcode = '22023', message = 'health_sample_batch_too_large';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(private.health_ingest_lock_key(v_uid));

  select envelope.min_date - 1, envelope.max_date
  into v_ingest_min, v_ingest_max
  from private.health_utc_offset_envelope_dates() as envelope;

  select coalesce(
    jsonb_agg(distinct jsonb_build_object(
      'local_date', activity.local_date,
      'metric_key', activity.metric_key
    )),
    '[]'::jsonb
  )
  into v_key_set
  from public.health_activities as activity
  where activity.user_id = v_uid
    and (
      exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_samples) as sample(value)
        where activity.provider = (sample.value->>'provider')::public.health_provider
          and activity.provider_native_id = pg_catalog.btrim(sample.value->>'provider_native_id')
      )
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_deleted_native_ids) as deleted(value)
        where activity.provider = (deleted.value->>'provider')::public.health_provider
          and activity.provider_native_id = pg_catalog.btrim(deleted.value->>'provider_native_id')
      )
    );

  for v_deleted in
    select value
    from pg_catalog.jsonb_array_elements(p_deleted_native_ids) as deleted(value)
  loop
    if v_deleted->>'provider' is null or v_deleted->>'provider_native_id' is null then
      raise exception using errcode = '22023', message = 'invalid_health_deletions';
    end if;

    delete from public.health_activities as activity
    where activity.user_id = v_uid
      and activity.provider = (v_deleted->>'provider')::public.health_provider
      and activity.provider_native_id = pg_catalog.btrim(v_deleted->>'provider_native_id');

    if found then
      v_deleted_count := v_deleted_count + 1;
    end if;
  end loop;

  for v_sample in
    select value
    from pg_catalog.jsonb_array_elements(p_samples) as sample(value)
  loop
    if v_sample->>'provider' is null
      or v_sample->>'provider_native_id' is null
      or v_sample->>'source_identifier' is null
      or v_sample->>'metric_key' is null
      or v_sample->>'started_at' is null
      or v_sample->>'utc_offset_minutes' is null
      or v_sample->>'value_numeric' is null
      or v_sample->>'unit' is null
    then
      raise exception using errcode = '22023', message = 'invalid_health_sample';
    end if;

    v_started_at := (v_sample->>'started_at')::timestamptz;
    v_offset := (v_sample->>'utc_offset_minutes')::integer;
    v_local_date := public.health_local_date_from_offset(v_started_at, v_offset);

    if v_local_date > v_ingest_max then
      raise exception using errcode = '22023', message = 'health_sample_date_out_of_range';
    end if;

    if v_local_date < v_ingest_min then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.health_activities (
      user_id,
      provider,
      provider_native_id,
      source_identifier,
      source_name,
      metric_key,
      started_at,
      ended_at,
      utc_offset_minutes,
      value_numeric,
      unit,
      payload
    )
    values (
      v_uid,
      (v_sample->>'provider')::public.health_provider,
      pg_catalog.btrim(v_sample->>'provider_native_id'),
      pg_catalog.btrim(v_sample->>'source_identifier'),
      nullif(pg_catalog.btrim(coalesce(v_sample->>'source_name', '')), ''),
      (v_sample->>'metric_key')::public.health_metric_key,
      v_started_at,
      nullif(v_sample->>'ended_at', '')::timestamptz,
      v_offset,
      (v_sample->>'value_numeric')::numeric,
      pg_catalog.btrim(v_sample->>'unit'),
      coalesce(v_sample->'payload', '{}'::jsonb)
    )
    on conflict (user_id, provider, provider_native_id)
    do update set
      source_identifier = excluded.source_identifier,
      source_name = excluded.source_name,
      metric_key = excluded.metric_key,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      utc_offset_minutes = excluded.utc_offset_minutes,
      value_numeric = excluded.value_numeric,
      unit = excluded.unit,
      payload = excluded.payload,
      suppressed_reason = case
        when public.health_activities.suppressed_reason = 'disconnected'
          then public.health_activities.suppressed_reason
        else null
      end;

    v_ingested := v_ingested + 1;
  end loop;

  select coalesce(v_key_set, '[]'::jsonb) || coalesce(
    (
      select jsonb_agg(distinct jsonb_build_object(
        'local_date', activity.local_date,
        'metric_key', activity.metric_key
      ))
      from public.health_activities as activity
      where activity.user_id = v_uid
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_samples) as sample(value)
          where activity.provider = (sample.value->>'provider')::public.health_provider
            and activity.provider_native_id = pg_catalog.btrim(sample.value->>'provider_native_id')
        )
    ),
    '[]'::jsonb
  )
  into v_key_set;

  for v_keys in
    select distinct
      (item.value->>'local_date')::date as local_date,
      (item.value->>'metric_key')::public.health_metric_key as metric_key
    from pg_catalog.jsonb_array_elements(v_key_set) as item(value)
    where item.value->>'local_date' is not null
      and item.value->>'metric_key' is not null
  loop
    perform private.elect_health_activities_for_key(
      v_uid,
      v_keys.local_date,
      v_keys.metric_key
    );
    v_from := least(coalesce(v_from, v_keys.local_date), v_keys.local_date);
    v_to := greatest(coalesce(v_to, v_keys.local_date), v_keys.local_date);
  end loop;

  if v_from is not null then
    perform private.recompute_health_daily_metrics_for_user(v_uid, v_from, v_to);
  end if;

  return jsonb_build_object(
    'ingested_count', v_ingested,
    'skipped_count', v_skipped,
    'deleted_count', v_deleted_count,
    'canonical_count', (
      select pg_catalog.count(*)::integer
      from public.health_activities as activity
      where activity.user_id = v_uid
        and activity.is_canonical
        and v_from is not null
        and activity.local_date between v_from and v_to
    ),
    'suppressed_count', (
      select pg_catalog.count(*)::integer
      from public.health_activities as activity
      where activity.user_id = v_uid
        and not activity.is_canonical
        and v_from is not null
        and activity.local_date between v_from and v_to
    ),
    'recomputed_days', case
      when v_from is null then 0
      else (v_to - v_from) + 1
    end
  );
end;
$$;

revoke all on function public.ingest_health_activities_service(jsonb, jsonb)
  from public, anon;
grant execute on function public.ingest_health_activities_service(jsonb, jsonb)
  to authenticated, service_role;
