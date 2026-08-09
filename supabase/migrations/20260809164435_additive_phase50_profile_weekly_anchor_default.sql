-- Additive phase 50:
-- Ensure profile inserts after phase 49 always get a weekly anchor cutover date.

alter table public.profiles
alter column weekly_anchor_effective_on set default current_date;

update public.profiles
set weekly_anchor_effective_on = current_date
where weekly_anchor_effective_on is null;
