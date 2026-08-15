alter policy "push_subscriptions_insert_self"
on public.push_subscriptions
with check (
  user_id = (select auth.uid())
  and platform = 'web'
);

alter policy "push_subscriptions_update_self"
on public.push_subscriptions
using (
  user_id = (select auth.uid())
  and platform = 'web'
)
with check (
  user_id = (select auth.uid())
  and platform = 'web'
);

alter policy "push_subscriptions_delete_self"
on public.push_subscriptions
using (
  user_id = (select auth.uid())
  and platform = 'web'
);
