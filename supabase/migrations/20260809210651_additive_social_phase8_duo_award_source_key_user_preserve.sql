create or replace function private.refresh_challenge_participant(
  p_challenge_id uuid,
  p_subject_kind public.social_subject_kind,
  p_subject_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_progress numeric;
  v_window_start date;
  v_window_end date;
  v_member_ids uuid[];
  v_member_id uuid;
  v_source_key text;
  v_award_seq bigint;
  v_awarded_any boolean := false;
  v_completed boolean := false;
begin
  if p_challenge_id is null or p_subject_id is null then
    return false;
  end if;

  select challenge.*
  into v_challenge
  from public.challenges challenge
  where challenge.id = p_challenge_id;

  if not found then
    return false;
  end if;
  if v_challenge.subject_kind <> p_subject_kind then
    return false;
  end if;
  if v_challenge.status not in ('active', 'closed') then
    return false;
  end if;

  v_member_ids := private.subject_member_ids(p_subject_kind, p_subject_id);
  if v_member_ids is null or array_length(v_member_ids, 1) is null then
    return false;
  end if;

  v_window_start := (v_challenge.starts_at at time zone 'UTC')::date;
  v_window_end := (least(p_now, v_challenge.ends_at) at time zone 'UTC')::date;

  v_progress := private.challenge_progress_value(
    v_challenge.metric,
    v_challenge.metric_track_key,
    v_member_ids,
    v_window_start,
    v_window_end
  );

  update public.challenge_participants participant
  set
    progress_value = v_progress,
    progress_at = p_now
  where participant.challenge_id = p_challenge_id
    and participant.subject_kind = p_subject_kind
    and participant.subject_id = p_subject_id;

  if not found then
    return false;
  end if;

  if v_challenge.status = 'active'
    and v_progress >= v_challenge.target_value then
    update public.challenge_participants participant
    set
      completed_at = coalesce(participant.completed_at, p_now)
    where participant.challenge_id = p_challenge_id
      and participant.subject_kind = p_subject_kind
      and participant.subject_id = p_subject_id
      and participant.completed_at is null;

    v_completed := found;

    if v_completed and v_challenge.reward_xp > 0 then
      foreach v_member_id in array v_member_ids
      loop
        if p_subject_kind = 'user'::public.social_subject_kind then
          v_source_key := 'challenge:' || p_challenge_id::text || ':user:' || v_member_id::text;
        else
          v_source_key := 'ch:' || pg_catalog.substr(
            md5(
              p_challenge_id::text || ':' || p_subject_kind::text || ':' || p_subject_id::text || ':' || v_member_id::text
            ),
            1,
            24
          );
        end if;

        select public.award_social_xp_service(
          v_member_id,
          'challenge_award',
          v_source_key,
          v_challenge.reward_xp
        )
        into v_award_seq;

        if v_award_seq is not null then
          v_awarded_any := true;
        end if;
      end loop;

      if v_awarded_any then
        update public.challenge_participants participant
        set awarded_at = coalesce(participant.awarded_at, p_now)
        where participant.challenge_id = p_challenge_id
          and participant.subject_kind = p_subject_kind
          and participant.subject_id = p_subject_id;
      end if;
    end if;

    if v_completed then
      foreach v_member_id in array v_member_ids
      loop
        perform private.emit_feed_event(
          p_actor_id => v_member_id,
          p_event_type => 'challenge_completed'::public.feed_event_type,
          p_subject_key => p_challenge_id::text || ':' || p_subject_kind::text || ':' || p_subject_id::text,
          p_bucket_date => (p_now at time zone 'UTC')::date,
          p_track_key => v_challenge.metric_track_key,
          p_goal_id => null,
          p_xp_delta => greatest(v_challenge.reward_xp, 0),
          p_occurrence_delta => 1,
          p_payload => jsonb_build_object(
            'challengeId', p_challenge_id,
            'metric', v_challenge.metric,
            'subjectKind', p_subject_kind,
            'subjectId', p_subject_id
          )
        );
      end loop;
    end if;
  end if;

  return true;
end;
$$;
