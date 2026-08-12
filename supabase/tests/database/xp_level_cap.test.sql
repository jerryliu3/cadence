begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(2);

select is(
  (
    select max(level)::integer
    from public.xp_levels
  ),
  1000,
  'xp levels seed extends to level 1000'
);

select is(
  private.xp_level_for_total(99999999),
  1000,
  'xp_level_for_total resolves to level 1000 at very high xp totals'
);

select * from finish();
rollback;
