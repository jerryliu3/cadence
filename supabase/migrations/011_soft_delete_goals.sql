alter table public.goals
add column if not exists is_deleted boolean not null default false;

create index if not exists goals_deleted_idx on public.goals(is_deleted);

create or replace function public.can_view_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.goals g
    left join public.goal_participants gp
      on gp.goal_id = g.id and gp.user_id = p_uid
    left join public.goal_shares gs
      on gs.goal_id = g.id and gs.shared_with = p_uid
    where g.id = p_goal_id
      and g.is_deleted = false
      and (g.owner_id = p_uid or gp.user_id is not null or gs.shared_with is not null)
  );
$$;

create or replace function public.can_complete_goal(p_goal_id uuid, p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.goals g
    left join public.goal_participants gp
      on gp.goal_id = g.id and gp.user_id = p_uid
    where g.id = p_goal_id
      and g.is_deleted = false
      and (g.owner_id = p_uid or gp.user_id is not null)
  );
$$;
