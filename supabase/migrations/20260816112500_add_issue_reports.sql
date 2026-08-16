create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null check (char_length(trim(description)) between 1 and 5000),
  status text not null default 'open' check (status in ('open', 'triaged', 'resolved')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists issue_reports_created_at_idx
on public.issue_reports (created_at desc);

create index if not exists issue_reports_reporter_created_idx
on public.issue_reports (reporter_id, created_at desc);

create or replace function public.issue_reports_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists issue_reports_touch_updated_at on public.issue_reports;
create trigger issue_reports_touch_updated_at
before update on public.issue_reports
for each row
execute function public.issue_reports_touch_updated_at();

alter table public.issue_reports enable row level security;

drop policy if exists issue_reports_insert_self on public.issue_reports;
create policy issue_reports_insert_self
on public.issue_reports
for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists issue_reports_select_self on public.issue_reports;
create policy issue_reports_select_self
on public.issue_reports
for select
to authenticated
using (auth.uid() = reporter_id);

revoke all on table public.issue_reports from public, anon;
grant select, insert on table public.issue_reports to authenticated;
