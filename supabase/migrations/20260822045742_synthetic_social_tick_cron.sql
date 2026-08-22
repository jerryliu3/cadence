create or replace function public.synthetic_activity_tick_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.synthetic_config%rowtype;
  v_real_dau integer := 0;
  v_completions_written integer := 0;
  v_reactions_written integer := 0;
  v_goal_id uuid;
  v_applied boolean;
  r_bot record;
begin
  select *
  into v_config
  from public.synthetic_config
  where id = 1;

  if not found then
    return jsonb_build_object('status', 'missing_config');
  end if;

  if v_config.enabled = false then
    return jsonb_build_object('status', 'disabled', 'completions_written', 0, 'reactions_written', 0);
  end if;

  select count(distinct completion.user_id)::integer
  into v_real_dau
  from public.completions completion
  left join public.synthetic_users synthetic
    on synthetic.user_id = completion.user_id
  where completion.completed_on = current_date
    and synthetic.user_id is null;

  if v_real_dau >= v_config.throttle_above_real_dau then
    return jsonb_build_object(
      'status', 'throttled',
      'real_dau', v_real_dau,
      'threshold', v_config.throttle_above_real_dau,
      'completions_written', 0,
      'reactions_written', 0
    );
  end if;

  update public.synthetic_users synthetic
  set completions_today = 0,
      last_active_date = current_date
  where synthetic.enabled = true
    and (synthetic.last_active_date is null or synthetic.last_active_date < current_date);

  for r_bot in
    select synthetic.user_id
    from public.synthetic_users synthetic
    where synthetic.enabled = true
      and synthetic.completions_today < synthetic.daily_budget
    order by random()
    limit v_config.max_completions_per_tick
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
          and completion.completed_on = current_date
      )
    order by random()
    limit 1;

    if v_goal_id is null then
      continue;
    end if;

    select public.synthetic_apply_completion_service(
      p_user_id => r_bot.user_id,
      p_goal_id => v_goal_id,
      p_completed_on => current_date
    )
    into v_applied;

    if v_applied then
      v_completions_written := v_completions_written + 1;
      update public.synthetic_users synthetic
      set completions_today = synthetic.completions_today + 1,
          last_active_date = current_date
      where synthetic.user_id = r_bot.user_id;
    end if;
  end loop;

  with reaction_candidates as (
    select
      feed.id as feed_event_id,
      bot.user_id,
      (
        array['cheer', 'fire', 'clap', 'strong']::public.reaction_kind[]
      )[(pg_catalog.floor(random() * 4)::integer + 1)] as reaction
    from public.synthetic_users bot
    join lateral (
      select event.id, event.actor_id
      from public.feed_events event
      join public.profiles actor
        on actor.id = event.actor_id
      where event.hidden_at is null
        and actor.social_activity_visible = true
        and event.created_at >= (pg_catalog.now() - interval '48 hours')
        and event.actor_id <> bot.user_id
      order by random()
      limit 1
    ) feed on true
    where bot.enabled = true
    order by random()
    limit v_config.max_reactions_per_tick
  )
  insert into public.feed_reactions (feed_event_id, user_id, reaction)
  select
    candidate.feed_event_id,
    candidate.user_id,
    candidate.reaction
  from reaction_candidates candidate
  on conflict (feed_event_id, user_id, reaction) do nothing;

  get diagnostics v_reactions_written = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'real_dau', v_real_dau,
    'completions_written', v_completions_written,
    'reactions_written', v_reactions_written
  );
end;
$$;

revoke all on function public.synthetic_activity_tick_service()
  from public, anon, authenticated;
grant execute on function public.synthetic_activity_tick_service()
  to service_role;

do $cron$
begin
  begin
    perform cron.unschedule('synthetic-social-activity');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'synthetic-social-activity',
    '*/15 * * * *',
    $job$select public.synthetic_activity_tick_service()$job$
  );
exception
  when others then null;
end;
$cron$;
