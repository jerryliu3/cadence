create or replace function public.claim_notification_outbox_service(
  p_limit integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  kind public.notification_kind,
  title text,
  body text,
  url text,
  attempts smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where outbox.state = 'pending'::public.notification_state
      and outbox.available_at <= pg_catalog.now()
    order by outbox.available_at asc, outbox.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.notification_outbox outbox
  set
    attempts = outbox.attempts + 1,
    available_at = pg_catalog.now() + interval '2 minutes'
  where outbox.id in (select candidates.id from candidates)
  returning
    outbox.id,
    outbox.user_id,
    outbox.kind,
    outbox.title,
    outbox.body,
    outbox.url,
    outbox.attempts;
end;
$$;
