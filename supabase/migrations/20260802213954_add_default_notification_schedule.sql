alter table public.notification_schedules
add column is_default boolean not null default false;

with default_candidates as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at, id
    ) as candidate_number
  from public.notification_schedules
  where hour = 21
    and message = 'Complete your checklist for today'
)
update public.notification_schedules as schedule
set is_default = true
from default_candidates
where schedule.id = default_candidates.id
  and default_candidates.candidate_number = 1;

create unique index notification_schedules_one_default_per_user_idx
on public.notification_schedules (user_id)
where is_default;
