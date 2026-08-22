-- Synthetic social cold-start backfill script
-- Usage example:
--   psql "$SUPABASE_DB_URL" -f supabase/scripts/synthetic_social_backfill.sql
--
-- This script is intentionally simple:
-- 1) Ensure synthetic users and goals exist.
-- 2) Backfill 14 days of completion activity for random synthetic users.
-- 3) Refresh challenge progress and leaderboard standings immediately.

begin;

select public.provision_synthetic_users_service(100, 6);

do $$
declare
  v_backfill_date date;
  v_day_offset integer;
  v_target_actions integer;
  v_action_count integer;
  v_goal_id uuid;
  r_bot record;
begin
  for v_day_offset in reverse 1..14 loop
    v_backfill_date := current_date - v_day_offset;
    v_target_actions := (30 + pg_catalog.floor(random() * 25)::integer);
    v_action_count := 0;

    for r_bot in
      select synthetic.user_id
      from public.synthetic_users synthetic
      where synthetic.enabled = true
      order by random()
      limit v_target_actions
    loop
      select goal.id
      into v_goal_id
      from public.goals goal
      where goal.owner_id = r_bot.user_id
        and goal.is_deleted = false
        and goal.archived_at is null
        and not exists (
          select 1
          from public.completions completion
          where completion.goal_id = goal.id
            and completion.user_id = r_bot.user_id
            and completion.completed_on = v_backfill_date
        )
      order by random()
      limit 1;

      if v_goal_id is null then
        continue;
      end if;

      if public.synthetic_apply_completion_service(r_bot.user_id, v_goal_id, v_backfill_date) then
        v_action_count := v_action_count + 1;
      end if;
    end loop;

    raise notice 'synthetic backfill date=% actions=%', v_backfill_date, v_action_count;
  end loop;
end;
$$;

select public.refresh_challenge_progress_service();
select public.refresh_leaderboard_standings_service();

commit;
