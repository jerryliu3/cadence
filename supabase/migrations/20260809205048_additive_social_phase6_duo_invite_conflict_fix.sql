create or replace function public.create_duo_invite_service(
  p_partner_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_duo_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_partner_id is null or p_partner_id = v_uid then
    raise exception using errcode = '22023', message = 'invalid_partner';
  end if;

  if exists (
    select 1 from public.duos duo
    where duo.status = 'active'
      and v_uid in (duo.user_a_id, duo.user_b_id)
  ) then
    raise exception using errcode = '23514', message = 'duo_already_active';
  end if;
  if exists (
    select 1 from public.duos duo
    where duo.status = 'active'
      and p_partner_id in (duo.user_a_id, duo.user_b_id)
  ) then
    raise exception using errcode = '23514', message = 'partner_already_active';
  end if;

  v_a := least(v_uid, p_partner_id);
  v_b := greatest(v_uid, p_partner_id);

  insert into public.duos (
    user_a_id,
    user_b_id,
    initiator_id,
    status,
    invite_message
  )
  values (
    v_a,
    v_b,
    v_uid,
    'pending'::public.duo_status,
    nullif(btrim(coalesce(p_message, '')), '')
  )
  on conflict (user_a_id, user_b_id)
  where status in ('pending', 'active')
  do nothing
  returning id into v_duo_id;

  if v_duo_id is null then
    select duo.id
    into v_duo_id
    from public.duos duo
    where duo.user_a_id = v_a
      and duo.user_b_id = v_b
      and duo.status in ('pending', 'active')
    order by duo.invited_at desc
    limit 1;
  end if;

  return v_duo_id;
end;
$$;
