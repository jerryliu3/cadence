-- Social Phase 2:
-- Admin authorization model and moderation audit primitives.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'admin_role'
  ) then
    create type public.admin_role as enum ('admin', 'moderator');
  end if;
end;
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.admin_role not null default 'moderator'::public.admin_role,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  note text
);

create index if not exists admin_users_active_idx
on public.admin_users (role, user_id)
where revoked_at is null;

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'moderation_target'
  ) then
    create type public.moderation_target as enum ('feed_event', 'user', 'challenge', 'team');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'moderation_action'
  ) then
    create type public.moderation_action as enum (
      'hide',
      'unhide',
      'ban_leaderboard',
      'unban_leaderboard',
      'remove_participant',
      'close_challenge'
    );
  end if;
end;
$$;

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  admin_username text not null,
  target_kind public.moderation_target not null,
  target_id uuid not null,
  action public.moderation_action not null,
  reason text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint moderation_actions_reason_len
    check (reason is null or pg_catalog.char_length(reason) <= 500)
);

create index if not exists moderation_actions_target_idx
on public.moderation_actions (target_kind, target_id, created_at desc);

alter table public.moderation_actions enable row level security;
revoke all on table public.moderation_actions from public, anon, authenticated;
grant select, insert, update, delete on table public.moderation_actions to service_role;

create or replace function public.is_platform_admin(
  p_min_role public.admin_role default 'moderator'::public.admin_role
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
      and a.revoked_at is null
      and (
        p_min_role = 'moderator'::public.admin_role
        or a.role = 'admin'::public.admin_role
      )
  );
$$;

revoke all on function public.is_platform_admin(public.admin_role)
  from public, anon;
grant execute on function public.is_platform_admin(public.admin_role)
  to authenticated;
grant execute on function public.is_platform_admin(public.admin_role)
  to service_role;

create or replace function private.is_platform_admin_for(
  p_user_id uuid,
  p_min_role public.admin_role default 'moderator'::public.admin_role
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = p_user_id
      and a.revoked_at is null
      and (
        p_min_role = 'moderator'::public.admin_role
        or a.role = 'admin'::public.admin_role
      )
  );
$$;

revoke all on function private.is_platform_admin_for(uuid, public.admin_role)
  from public, anon, authenticated;
grant execute on function private.is_platform_admin_for(uuid, public.admin_role)
  to service_role;
