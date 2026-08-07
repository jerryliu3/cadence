drop policy if exists xp_ledger_owner_select on public.xp_ledger;
create policy xp_ledger_owner_select
on public.xp_ledger
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on table public.xp_ledger to authenticated;
