create or replace function public.add_feed_reaction_service(
  p_feed_event_id uuid,
  p_reaction public.reaction_kind
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor_id uuid;
  v_event_hidden_at timestamptz;
  v_actor_visible boolean;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_feed_event_id is null then
    raise exception using errcode = '22023', message = 'feed_event_id_required';
  end if;

  select event.actor_id, event.hidden_at, actor.social_activity_visible
  into v_actor_id, v_event_hidden_at, v_actor_visible
  from public.feed_events event
  join public.profiles actor
    on actor.id = event.actor_id
  where event.id = p_feed_event_id;

  if not found then
    raise exception using errcode = '22023', message = 'feed_event_not_found';
  end if;
  if v_event_hidden_at is not null or coalesce(v_actor_visible, false) = false then
    raise exception using errcode = '42501', message = 'feed_event_not_visible';
  end if;

  insert into public.feed_reactions (feed_event_id, user_id, reaction)
  values (p_feed_event_id, v_uid, p_reaction)
  on conflict (feed_event_id, user_id, reaction) do nothing;

  if v_uid <> v_actor_id and private.is_active_team_pair(v_uid, v_actor_id) then
    perform private.enqueue_notification_outbox(
      p_user_id => v_actor_id,
      p_kind => 'reaction'::public.notification_kind,
      p_title => 'Your activity got a reaction',
      p_body => 'Your partner reacted to one of your feed updates.',
      p_url => '/social',
      p_dedupe_key => 'reaction:' || p_feed_event_id::text || ':' || p_reaction::text || ':' || v_uid::text
    );
  end if;

  return true;
end;
$$;

revoke all on function public.add_feed_reaction_service(uuid, public.reaction_kind)
  from public, anon;
grant execute on function public.add_feed_reaction_service(uuid, public.reaction_kind)
  to authenticated;
