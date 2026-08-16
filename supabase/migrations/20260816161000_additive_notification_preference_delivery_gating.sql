-- Add explicit "disabled_by_user_preference" handling at resolution time.

create or replace function public.resolve_notification_outbox_delivery_service(
  p_outbox_id uuid,
  p_sent boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outbox_id is null then
    raise exception using errcode = '22023', message = 'outbox_id_required';
  end if;

  if p_sent then
    update public.notification_outbox outbox
    set
      state = 'sent'::public.notification_state,
      sent_at = pg_catalog.now(),
      last_error = null
    where outbox.id = p_outbox_id
      and outbox.state = 'pending'::public.notification_state;
    return found;
  end if;

  if p_error = 'disabled_by_user_preference' then
    update public.notification_outbox outbox
    set
      state = 'skipped'::public.notification_state,
      last_error = p_error
    where outbox.id = p_outbox_id
      and outbox.state = 'pending'::public.notification_state;
    return found;
  end if;

  if p_error = 'web_configuration_unavailable' then
    update public.notification_outbox outbox
    set
      attempts = greatest(outbox.attempts::integer - 1, 0)::smallint,
      available_at = pg_catalog.now() + interval '5 minutes',
      last_error = p_error
    where outbox.id = p_outbox_id
      and outbox.state = 'pending'::public.notification_state;
    return found;
  end if;

  update public.notification_outbox outbox
  set
    state = case
      when outbox.attempts >= 5 then 'failed'::public.notification_state
      else 'pending'::public.notification_state
    end,
    last_error = nullif(pg_catalog.btrim(coalesce(p_error, '')), ''),
    available_at = case
      when outbox.attempts >= 5 then outbox.available_at
      else pg_catalog.now() + ((outbox.attempts + 1)::text || ' minutes')::interval
    end
  where outbox.id = p_outbox_id
    and outbox.state = 'pending'::public.notification_state;

  return found;
end;
$$;
