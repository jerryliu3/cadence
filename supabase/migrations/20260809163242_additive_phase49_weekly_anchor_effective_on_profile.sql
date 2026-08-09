-- Additive phase 49:
-- Persist the weekly anchor cutover date so weekStartsOn alignment can be
-- applied forward-only without rebucketing historical periods.

alter table public.profiles
add column if not exists weekly_anchor_effective_on date;

update public.profiles
set weekly_anchor_effective_on = (
  current_date + (
    (
      7 - (
        (
          extract(dow from current_date)::int - week_starts_on + 7
        ) % 7
      )
    ) % 7
  )
)
where weekly_anchor_effective_on is null;

alter table public.profiles
alter column weekly_anchor_effective_on set not null;
