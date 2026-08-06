alter table public.execution_plans
drop constraint if exists execution_plans_eligibility_mode;

alter table public.execution_plans
add constraint execution_plans_eligibility_mode
check (eligibility_mode in ('end_month_v1', 'overlap_v1'));
