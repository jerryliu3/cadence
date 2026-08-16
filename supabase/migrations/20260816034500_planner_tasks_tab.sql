create table if not exists public.planner_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  scheduled_date date not null default current_date,
  completed_at timestamptz,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint planner_tasks_title_nonempty check (char_length(btrim(title)) between 1 and 200)
);

create index if not exists planner_tasks_owner_scheduled_idx
  on public.planner_tasks (owner_id, scheduled_date, created_at);

create index if not exists planner_tasks_owner_completed_idx
  on public.planner_tasks (owner_id, completed_at);

alter table public.planner_tasks enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planner_tasks'
      and policyname = 'planner_tasks_owner_select'
  ) then
    create policy planner_tasks_owner_select
      on public.planner_tasks
      for select
      to authenticated
      using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planner_tasks'
      and policyname = 'planner_tasks_owner_insert'
  ) then
    create policy planner_tasks_owner_insert
      on public.planner_tasks
      for insert
      to authenticated
      with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planner_tasks'
      and policyname = 'planner_tasks_owner_update'
  ) then
    create policy planner_tasks_owner_update
      on public.planner_tasks
      for update
      to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end;
$$;

create or replace function public.create_planner_task(
  p_title text,
  p_scheduled_date date default null
)
returns table (
  task_id uuid,
  title text,
  scheduled_date date,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_timezone text := 'UTC';
  v_title text := btrim(coalesce(p_title, ''));
  v_scheduled_date date;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if char_length(v_title) = 0 then
    raise exception using errcode = '22023', message = 'invalid_task_title';
  end if;

  if char_length(v_title) > 200 then
    raise exception using errcode = '22023', message = 'task_title_too_long';
  end if;

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = v_uid;

  v_scheduled_date := coalesce(
    p_scheduled_date,
    private.local_today_for_timezone(coalesce(v_timezone, 'UTC'))
  );

  return query
  insert into public.planner_tasks (
    owner_id,
    title,
    scheduled_date,
    completed_at,
    is_deleted,
    updated_at
  )
  values (
    v_uid,
    v_title,
    v_scheduled_date,
    null,
    false,
    timezone('utc', now())
  )
  returning
    id as task_id,
    public.planner_tasks.title,
    public.planner_tasks.scheduled_date,
    public.planner_tasks.completed_at,
    public.planner_tasks.created_at,
    public.planner_tasks.updated_at;
end;
$$;

create or replace function public.set_planner_task_completion(
  p_task_id uuid,
  p_completed boolean default true
)
returns table (
  task_id uuid,
  title text,
  scheduled_date date,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  with updated as (
    update public.planner_tasks t
    set
      completed_at = case
        when coalesce(p_completed, true) then coalesce(t.completed_at, timezone('utc', now()))
        else null
      end,
      updated_at = timezone('utc', now())
    where t.id = p_task_id
      and t.owner_id = v_uid
      and t.is_deleted = false
    returning
      t.id,
      t.title,
      t.scheduled_date,
      t.completed_at,
      t.created_at,
      t.updated_at
  )
  select
    updated.id as task_id,
    updated.title,
    updated.scheduled_date,
    updated.completed_at,
    updated.created_at,
    updated.updated_at
  from updated;

  if not found then
    raise exception using errcode = 'P0001', message = 'planner_task_not_found';
  end if;
end;
$$;

create or replace function public.list_planner_tasks(
  p_for_date date default null
)
returns table (
  task_id uuid,
  title text,
  scheduled_date date,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_timezone text := 'UTC';
  v_today date;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select coalesce(p.timezone, 'UTC')
  into v_timezone
  from public.profiles p
  where p.id = v_uid;

  v_today := private.local_today_for_timezone(coalesce(v_timezone, 'UTC'));

  return query
  select
    t.id as task_id,
    t.title,
    t.scheduled_date,
    t.completed_at,
    t.created_at,
    t.updated_at
  from public.planner_tasks t
  where t.owner_id = v_uid
    and t.is_deleted = false
    and (
      t.completed_at is null
      or (t.completed_at at time zone coalesce(v_timezone, 'UTC'))::date >= v_today
    )
    and (p_for_date is null or t.scheduled_date = p_for_date)
  order by
    case when t.completed_at is null then 0 else 1 end asc,
    t.scheduled_date asc,
    t.created_at asc;
end;
$$;

revoke all on function public.create_planner_task(text, date) from public, anon;
grant execute on function public.create_planner_task(text, date)
  to authenticated, service_role;

revoke all on function public.set_planner_task_completion(uuid, boolean) from public, anon;
grant execute on function public.set_planner_task_completion(uuid, boolean)
  to authenticated, service_role;

revoke all on function public.list_planner_tasks(date) from public, anon;
grant execute on function public.list_planner_tasks(date)
  to authenticated, service_role;
