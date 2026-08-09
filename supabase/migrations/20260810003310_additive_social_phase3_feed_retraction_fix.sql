-- Social Phase 3 follow-up:
-- Prevent retraction updates from violating positive-count checks by
-- computing post-update totals before applying changes.

create or replace function private.emit_feed_event(
  p_actor_id uuid,
  p_event_type public.feed_event_type,
  p_subject_key text,
  p_bucket_date date default null,
  p_track_key text default null,
  p_goal_id uuid default null,
  p_xp_delta integer default 0,
  p_occurrence_delta integer default 1,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket_date date := coalesce(
    p_bucket_date,
    private.local_today_for_profile(p_actor_id),
    current_date
  );
  v_event_id uuid;
  v_actor_visible boolean;
  v_existing public.feed_events%rowtype;
  v_next_xp integer;
  v_next_occurrence integer;
begin
  select profile.social_activity_visible
  into v_actor_visible
  from public.profiles profile
  where profile.id = p_actor_id;

  if coalesce(v_actor_visible, false) = false then
    return null;
  end if;

  if p_occurrence_delta = 0 then
    return null;
  end if;

  if p_occurrence_delta < 0 or p_xp_delta < 0 then
    select event.*
    into v_existing
    from public.feed_events event
    where event.actor_id = p_actor_id
      and event.event_type = p_event_type
      and event.subject_key = p_subject_key
      and event.bucket_date = v_bucket_date
    for update;

    if not found then
      return null;
    end if;

    v_next_xp := v_existing.xp_delta + p_xp_delta;
    v_next_occurrence := v_existing.occurrence_count + p_occurrence_delta;

    if v_next_xp <= 0 or v_next_occurrence <= 0 then
      delete from public.feed_events event where event.id = v_existing.id;
      return v_existing.id;
    end if;

    update public.feed_events event
    set
      xp_delta = v_next_xp,
      occurrence_count = v_next_occurrence,
      goal_id = case
        when event.goal_id is distinct from p_goal_id then null
        else event.goal_id
      end,
      payload = coalesce(p_payload, event.payload),
      updated_at = pg_catalog.now()
    where event.id = v_existing.id
    returning event.id into v_event_id;

    return v_event_id;
  end if;

  insert into public.feed_events (
    actor_id,
    event_type,
    subject_key,
    bucket_date,
    track_key,
    goal_id,
    xp_delta,
    occurrence_count,
    payload
  )
  values (
    p_actor_id,
    p_event_type,
    p_subject_key,
    v_bucket_date,
    p_track_key,
    p_goal_id,
    p_xp_delta,
    greatest(p_occurrence_delta, 1),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (actor_id, event_type, subject_key, bucket_date) do update
    set
      xp_delta = public.feed_events.xp_delta + excluded.xp_delta,
      occurrence_count = public.feed_events.occurrence_count + p_occurrence_delta,
      goal_id = case
        when public.feed_events.goal_id is distinct from excluded.goal_id then null
        else public.feed_events.goal_id
      end,
      payload = coalesce(excluded.payload, public.feed_events.payload),
      updated_at = pg_catalog.now()
  returning id into v_event_id;

  return v_event_id;
end;
$$;
