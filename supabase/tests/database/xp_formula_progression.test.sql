begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(8);

select is(private.xp_min_total_for_level(2), 100, 'level 2 starts at 100 XP');
select is(private.xp_min_total_for_level(11), 4000, 'level 11 starts at 4000 XP');
select is(private.xp_min_total_for_level(12), 4900, 'level 12 starts at 4900 XP');

select is(private.xp_level_for_total(99), 1, '99 XP stays at level 1');
select is(private.xp_level_for_total(100), 2, '100 XP reaches level 2');
select is(private.xp_level_for_total(145), 2, '145 XP stays at level 2');
select is(private.xp_level_for_total(4900), 12, '4900 XP reaches level 12');
select is(private.xp_level_for_total(99999999), 1000, 'very high XP caps at level 1000');

select * from finish();
rollback;
