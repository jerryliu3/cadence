create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx
on public.push_subscriptions (user_id);

create table public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  timezone text not null check (char_length(timezone) between 1 and 100),
  message text not null
    default 'Complete your checklist for today'
    check (char_length(btrim(message)) between 1 and 180),
  enabled boolean not null default true,
  last_sent_local_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_schedules_dispatch_idx
on public.notification_schedules (enabled, hour);

create index notification_schedules_user_id_idx
on public.notification_schedules (user_id);

alter table public.push_subscriptions enable row level security;
alter table public.notification_schedules enable row level security;

create policy "push_subscriptions_select_self"
on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

create policy "push_subscriptions_insert_self"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "push_subscriptions_update_self"
on public.push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "push_subscriptions_delete_self"
on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

create policy "notification_schedules_select_self"
on public.notification_schedules
for select
to authenticated
using (user_id = auth.uid());

create policy "notification_schedules_insert_self"
on public.notification_schedules
for insert
to authenticated
with check (user_id = auth.uid());

create policy "notification_schedules_update_self"
on public.notification_schedules
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "notification_schedules_delete_self"
on public.notification_schedules
for delete
to authenticated
using (user_id = auth.uid());
