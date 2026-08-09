create or replace function private.planner_schedule_digest_for_owner(
  p_owner uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select private.sha256_hex_digest(
    coalesce(
      string_agg(
        format(
          '%s|%s|%s|%s|%s|%s',
          item.goal_id::text,
          item.unit_key,
          item.scheduled_date::text,
          coalesce(item.original_scheduled_date::text, ''),
          coalesce(item.scheduled_time, ''),
          case when item.locked then '1' else '0' end
        ),
        ',' order by item.goal_id, item.unit_key
      ),
      'empty'
    )
  )
  from public.planner_items item
  where item.owner_id = p_owner;
$$;

create or replace function public.create_planner_proposal_service(
  p_target_owner_id uuid,
  p_scope_month date,
  p_operations jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_baseline_digest text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_target_owner_id is null or p_target_owner_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_target_owner';
  end if;
  if p_scope_month is null or extract(day from p_scope_month) <> 1 then
    raise exception using errcode = '22023', message = 'invalid_scope_month';
  end if;

  perform private.validate_planner_proposal_operations(p_operations);

  select duo.id
  into v_team_id
  from public.teams duo
  where duo.status = 'active'::public.team_status
    and (
      (duo.user_a_id = v_uid and duo.user_b_id = p_target_owner_id)
      or (duo.user_b_id = v_uid and duo.user_a_id = p_target_owner_id)
    )
  limit 1;

  if v_team_id is null then
    raise exception using errcode = '22023', message = 'team_required';
  end if;

  if not exists (
    select 1
    from public.team_preferences pref
    where pref.team_id = v_team_id
      and pref.user_id = p_target_owner_id
      and pref.allow_proposals = true
  ) then
    raise exception using errcode = '42501', message = 'proposals_not_allowed';
  end if;

  v_baseline_digest := private.planner_schedule_digest_for_owner(p_target_owner_id);

  begin
    insert into public.planner_proposals (
      team_id,
      proposer_id,
      target_owner_id,
      scope_month,
      baseline_schedule_digest,
      operations,
      note
    )
    values (
      v_team_id,
      v_uid,
      p_target_owner_id,
      p_scope_month,
      v_baseline_digest,
      p_operations,
      nullif(btrim(coalesce(p_note, '')), '')
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'proposal_already_pending';
  end;

  if private.partner_notifications_allowed(v_team_id, p_target_owner_id) then
    perform private.enqueue_notification_outbox(
      p_user_id => p_target_owner_id,
      p_kind => 'planner_proposal'::public.notification_kind,
      p_title => 'New planner proposal',
      p_body => 'Your team partner proposed planner updates for review.',
      p_url => '/social?tab=team',
      p_dedupe_key => 'planner-proposal:' || v_id::text
    );
  end if;

  return v_id;
end;
$$;

revoke all on function private.planner_schedule_digest_for_owner(uuid)
  from public, anon, authenticated;
