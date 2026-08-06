alter table public.execution_plan_days
drop constraint if exists execution_plan_days_scope;

alter table public.execution_plan_days
add constraint execution_plan_days_scope_anchor
check (extract(day from scope_month) = 1);
