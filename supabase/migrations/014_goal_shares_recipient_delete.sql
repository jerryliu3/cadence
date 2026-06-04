drop policy if exists "goal_shares_recipient_delete" on public.goal_shares;

create policy "goal_shares_recipient_delete"
on public.goal_shares
for delete
to authenticated
using (shared_with = auth.uid());
