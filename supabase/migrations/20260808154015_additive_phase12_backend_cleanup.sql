-- Additive Phase 12:
-- Backend-only post-cutover cleanup and hardening.

create or replace function private.sha256_hex_digest(p_value text)
returns text
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_digest_schema text;
  v_digest bytea;
begin
  select ns.nspname
  into v_digest_schema
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace ns
    on ns.oid = proc.pronamespace
  where proc.proname = 'digest'
    and proc.proargtypes = '17 25'::pg_catalog.oidvector
  order by
    case ns.nspname
      when 'extensions' then 0
      when 'public' then 1
      else 2
    end
  limit 1;

  if v_digest_schema is null then
    raise exception using
      errcode = '42883',
      message = 'pgcrypto digest(bytea, text) is required';
  end if;

  execute format(
    'select %I.digest($1::bytea, %L)',
    v_digest_schema,
    'sha256'
  )
  into v_digest
  using pg_catalog.convert_to(coalesce(p_value, ''), 'UTF8');

  return pg_catalog.encode(v_digest, 'hex');
end;
$$;

revoke all on function private.sha256_hex_digest(text) from public;
revoke all on function private.sha256_hex_digest(text) from anon;
revoke all on function private.sha256_hex_digest(text) from authenticated;

create or replace function public.get_planner_schedule_digest(
  p_owner uuid default auth.uid()
)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select private.sha256_hex_digest(
    coalesce(
      string_agg(
        format(
          '%s|%s|%s|%s|%s',
          item.goal_id::text,
          item.unit_key,
          item.scheduled_date::text,
          coalesce(item.scheduled_time, ''),
          case when item.locked then '1' else '0' end
        ),
        ',' order by item.goal_id, item.unit_key
      ),
      'empty'
    )
  )
  from public.planner_items item
  where item.owner_id = p_owner;
$$;

grant execute on function public.get_planner_schedule_digest(uuid) to authenticated;

update public.profiles
set rest_weekdays = (
  select coalesce(
    array_agg(entry.day order by entry.day),
    '{}'::smallint[]
  )
  from (
    select distinct day
    from unnest(rest_weekdays) as day
    where day between 0 and 6
    limit 7
  ) as entry
);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'profiles_rest_weekdays_cardinality'
      and conrelid = 'public.profiles'::pg_catalog.regclass
  ) then
    alter table public.profiles
    add constraint profiles_rest_weekdays_cardinality
    check (cardinality(rest_weekdays) <= 7);
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_type typ
    join pg_catalog.pg_namespace ns
      on ns.oid = typ.typnamespace
    join pg_catalog.pg_enum enum
      on enum.enumtypid = typ.oid
    where ns.nspname = 'public'
      and typ.typname = 'goal_frequency_type'
      and enum.enumlabel = 'one_time'
  ) then
    alter table public.goals
    drop constraint if exists goals_no_one_time_frequency;
    alter table public.goals
    drop constraint if exists goals_deadline_required_by_requirement;
    alter table public.goals
    drop constraint if exists milestones_need_target;
    alter table public.goals
    drop constraint if exists recurring_needs_interval;

    alter table public.goals
    alter column frequency_type drop default;

    create type public.goal_frequency_type_v2 as enum (
      'fixed_milestones',
      'recurring'
    );

    alter table public.goals
    alter column frequency_type
    type public.goal_frequency_type_v2
    using (
      case
        when frequency_type::text = 'one_time' then 'fixed_milestones'
        else frequency_type::text
      end
    )::public.goal_frequency_type_v2;

    drop type public.goal_frequency_type;
    alter type public.goal_frequency_type_v2 rename to goal_frequency_type;

    alter table public.goals
    alter column frequency_type
    set default 'fixed_milestones'::public.goal_frequency_type;

    alter table public.goals
    add constraint milestones_need_target
    check (
      frequency_type <> 'fixed_milestones'::public.goal_frequency_type
      or (
        target_count is not null
        and target_count > 0
      )
    );

    alter table public.goals
    add constraint recurring_needs_interval
    check (
      frequency_type <> 'recurring'::public.goal_frequency_type
      or recurrence_interval is not null
    );

    alter table public.goals
    add constraint goals_deadline_required_by_requirement
    check (
      end_date is not null
      or (
        frequency_type = 'recurring'::public.goal_frequency_type
        and (
          target_count is null
          or target_count <= 0
        )
      )
    ) not valid;
  end if;
end;
$$;
