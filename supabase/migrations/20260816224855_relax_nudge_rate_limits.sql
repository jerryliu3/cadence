create or replace function public.send_nudge_service(
  p_to_user_id uuid,
  p_kind public.nudge_kind default 'cheer',
  p_goal_id uuid default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_message text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_nudge_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_to_user_id is null or p_to_user_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_nudge_target';
  end if;

  -- Resolve the shared active team; do not take "my" team then assume the pair.
  v_team_id := private.team_id_for_pair(v_uid, p_to_user_id);
  if v_team_id is null then
    raise exception using errcode = '22023', message = 'team_required';
  end if;

  if (
    select count(*)::integer
    from public.nudges nudge
    where nudge.from_user_id = v_uid
      and nudge.created_at >= pg_catalog.now() - interval '24 hours'
  ) >= 20 then
    raise exception using errcode = '42900', message = 'nudge_rate_limited_24h';
  end if;

  if (
    select count(*)::integer
    from public.nudges nudge
    where nudge.from_user_id = v_uid
      and nudge.to_user_id = p_to_user_id
      and nudge.goal_id is not distinct from p_goal_id
      and nudge.created_at::date = current_date
  ) >= 10 then
    raise exception using errcode = '42900', message = 'nudge_rate_limited_goal_daily';
  end if;

  if p_kind <> 'custom'::public.nudge_kind then
    v_message := null;
  elsif v_message is null then
    raise exception using errcode = '22023', message = 'custom_nudge_message_required';
  end if;

  insert into public.nudges (
    team_id,
    from_user_id,
    to_user_id,
    kind,
    goal_id,
    message
  )
  values (
    v_team_id,
    v_uid,
    p_to_user_id,
    p_kind,
    p_goal_id,
    v_message
  )
  returning id into v_nudge_id;

  perform private.enqueue_notification_outbox(
    p_user_id => p_to_user_id,
    p_kind => 'nudge'::public.notification_kind,
    p_title => 'New nudge from your partner',
    p_body => case
      when p_kind = 'custom'::public.nudge_kind and v_message is not null then v_message
      else 'Your partner sent a nudge to keep momentum going.'
    end,
    p_url => '/social?tab=team',
    p_dedupe_key => 'nudge:' || v_nudge_id::text
  );

  return v_nudge_id;
end;
$$;
