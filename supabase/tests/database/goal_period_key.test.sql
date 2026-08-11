begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(30);

with fixtures(anchor_date, interval_name, reference_date, expected_period_start) as (
  values
    ('2026-01-01'::date, 'daily'::text, '2026-01-01'::date, '2026-01-01'::text),
    ('2026-01-01'::date, 'daily'::text, '2026-01-02'::date, '2026-01-02'::text),
    ('2026-01-01'::date, 'daily'::text, '2026-01-31'::date, '2026-01-31'::text),
    ('2024-02-28'::date, 'daily'::text, '2024-02-29'::date, '2024-02-29'::text),
    ('2025-12-31'::date, 'daily'::text, '2026-01-01'::date, '2026-01-01'::text),
    ('2026-08-06'::date, 'weekly'::text, '2026-08-06'::date, '2026-08-06'::text),
    ('2026-08-06'::date, 'weekly'::text, '2026-08-07'::date, '2026-08-06'::text),
    ('2026-08-06'::date, 'weekly'::text, '2026-08-12'::date, '2026-08-06'::text),
    ('2026-08-06'::date, 'weekly'::text, '2026-08-13'::date, '2026-08-13'::text),
    ('2026-08-06'::date, 'weekly'::text, '2026-08-19'::date, '2026-08-13'::text),
    ('2026-08-06'::date, 'weekly'::text, '2026-08-20'::date, '2026-08-20'::text),
    ('2026-12-30'::date, 'weekly'::text, '2027-01-01'::date, '2026-12-30'::text),
    ('2026-12-30'::date, 'weekly'::text, '2027-01-05'::date, '2026-12-30'::text),
    ('2026-12-30'::date, 'weekly'::text, '2027-01-06'::date, '2027-01-06'::text),
    ('2024-01-31'::date, 'monthly'::text, '2024-01-31'::date, '2024-01-31'::text),
    ('2024-01-31'::date, 'monthly'::text, '2024-02-28'::date, '2024-01-31'::text),
    ('2024-01-31'::date, 'monthly'::text, '2024-02-29'::date, '2024-02-29'::text),
    ('2024-01-31'::date, 'monthly'::text, '2024-03-28'::date, '2024-02-29'::text),
    ('2024-01-31'::date, 'monthly'::text, '2024-03-29'::date, '2024-02-29'::text),
    ('2025-01-31'::date, 'monthly'::text, '2025-02-27'::date, '2025-01-31'::text),
    ('2025-01-31'::date, 'monthly'::text, '2025-02-28'::date, '2025-02-28'::text),
    ('2025-01-31'::date, 'monthly'::text, '2025-03-30'::date, '2025-02-28'::text),
    ('2025-01-31'::date, 'monthly'::text, '2025-03-31'::date, '2025-03-31'::text),
    ('2025-01-30'::date, 'monthly'::text, '2025-02-27'::date, '2025-01-30'::text),
    ('2025-01-30'::date, 'monthly'::text, '2025-02-28'::date, '2025-02-28'::text),
    ('2025-01-30'::date, 'monthly'::text, '2025-03-29'::date, '2025-02-28'::text),
    ('2025-01-30'::date, 'monthly'::text, '2025-03-30'::date, '2025-03-30'::text),
    ('2025-11-30'::date, 'monthly'::text, '2025-12-29'::date, '2025-11-30'::text),
    ('2025-11-30'::date, 'monthly'::text, '2025-12-30'::date, '2025-12-30'::text),
    ('2025-11-30'::date, 'monthly'::text, '2026-01-30'::date, '2026-01-30'::text)
)
select is(
  private.goal_period_key(
    anchor_date,
    interval_name::public.recurrence_interval,
    reference_date
  ),
  expected_period_start,
  format(
    'period key for anchor=%s interval=%s reference=%s',
    anchor_date,
    interval_name,
    reference_date
  )
)
from fixtures;

select * from finish();
rollback;
