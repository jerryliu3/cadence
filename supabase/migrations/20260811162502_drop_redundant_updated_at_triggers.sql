-- Drop redundant / unused updated_at triggers.
--
-- Keep set_goals_updated_at: many client update paths omit updated_at.
-- Keep public.set_updated_at(): still used by goals.
--
-- Safe to drop:
-- - planner_items: RPC writers only; product does not rely on updated_at
-- - planner_coach_conversations: insert-only path; trigger never fires
-- - push_subscriptions / notification_schedules: writers already set updated_at

drop trigger if exists set_planner_items_updated_at
on public.planner_items;

drop trigger if exists set_planner_coach_conversations_updated_at
on public.planner_coach_conversations;

drop trigger if exists set_push_subscriptions_updated_at
on public.push_subscriptions;

drop trigger if exists set_notification_schedules_updated_at
on public.notification_schedules;
