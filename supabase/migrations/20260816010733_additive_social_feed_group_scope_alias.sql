do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'get_social_feed'
      and pg_get_function_identity_arguments(oid) =
        'p_scope text, p_scope_id uuid, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer'
  ) and not exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'get_social_feed_legacy'
      and pg_get_function_identity_arguments(oid) =
        'p_scope text, p_scope_id uuid, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer'
  ) then
    alter function public.get_social_feed(
      text,
      uuid,
      timestamptz,
      uuid,
      integer
    ) rename to get_social_feed_legacy;
  end if;
end;
$$;

create or replace function public.get_social_feed(
  p_scope text default 'global',
  p_scope_id uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  event_type public.feed_event_type,
  created_at timestamptz,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
  track_key text,
  category_label text,
  goal_title text,
  xp_delta integer,
  occurrence_count integer,
  reaction_count integer,
  viewer_reacted boolean,
  payload jsonb,
  hidden_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_scope text := case when p_scope = 'group' then 'cohort' else p_scope end;
begin
  return query
  select *
  from public.get_social_feed_legacy(
    p_scope => v_scope,
    p_scope_id => p_scope_id,
    p_before_at => p_before_at,
    p_before_id => p_before_id,
    p_limit => p_limit
  );
exception
  when sqlstate '22023' then
    if p_scope = 'group' and sqlerrm = 'cohort_scope_required' then
      raise exception using errcode = '22023', message = 'group_scope_required';
    end if;
    raise;
  when sqlstate '42501' then
    if p_scope = 'group' and sqlerrm = 'cohort_membership_required' then
      raise exception using errcode = '42501', message = 'group_membership_required';
    end if;
    raise;
end;
$$;

revoke all on function public.get_social_feed(
  text,
  uuid,
  timestamptz,
  uuid,
  integer
) from public, anon;
grant execute on function public.get_social_feed(
  text,
  uuid,
  timestamptz,
  uuid,
  integer
) to authenticated;
