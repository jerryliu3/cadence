-- XP Phase 5:
-- Extend table-driven level curve from level 10 to level 1000 while
-- preserving the existing gentle progression trend.

with recursive generated_levels as (
  select
    11::integer as level,
    4000::integer as min_total_xp
  union all
  select
    (generated_levels.level + 1)::integer as level,
    (
      generated_levels.min_total_xp
      + ((generated_levels.level - 2) * 100)
    )::integer as min_total_xp
  from generated_levels
  where generated_levels.level < 1000
)
insert into public.xp_levels (
  level,
  min_total_xp,
  title
)
select
  generated_levels.level,
  generated_levels.min_total_xp,
  'Level ' || generated_levels.level::text
from generated_levels
on conflict (level) do update
set
  min_total_xp = excluded.min_total_xp,
  title = excluded.title;

update public.xp_profiles
set
  current_level = private.xp_level_for_total(total_xp),
  updated_at = pg_catalog.now();
