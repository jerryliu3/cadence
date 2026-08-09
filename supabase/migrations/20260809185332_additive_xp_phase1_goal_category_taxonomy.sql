-- XP Phase 1:
-- Introduce constrained goal category taxonomy and derive goals.category_key.

create table if not exists public.goal_categories (
  key text primary key,
  label text not null,
  aliases text[] not null default '{}'::text[],
  color text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goal_categories_key_format'
      and conrelid = 'public.goal_categories'::regclass
  ) then
    alter table public.goal_categories
    add constraint goal_categories_key_format
    check (key ~ '^[a-z][a-z0-9_]{1,31}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'goal_categories_global_reserved'
      and conrelid = 'public.goal_categories'::regclass
  ) then
    alter table public.goal_categories
    add constraint goal_categories_global_reserved
    check (key <> 'global');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'goal_categories_label_len'
      and conrelid = 'public.goal_categories'::regclass
  ) then
    alter table public.goal_categories
    add constraint goal_categories_label_len
    check (char_length(label) between 1 and 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'goal_categories_aliases_cardinality'
      and conrelid = 'public.goal_categories'::regclass
  ) then
    alter table public.goal_categories
    add constraint goal_categories_aliases_cardinality
    check (coalesce(array_length(aliases, 1), 0) <= 40);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'goal_categories_color_hex'
      and conrelid = 'public.goal_categories'::regclass
  ) then
    alter table public.goal_categories
    add constraint goal_categories_color_hex
    check (color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end;
$$;

create unique index if not exists goal_categories_sort_order_key_idx
on public.goal_categories (sort_order, key);

insert into public.goal_categories (key, label, aliases, color, sort_order)
values
  ('personal', 'Personal', array['planning', 'productivity', 'home'], '#6366f1', 10),
  ('relationships', 'Relationships', array['social', 'family'], '#f43f5e', 20),
  ('health', 'Health', array['fitness', 'wellness', 'nutrition'], '#10b981', 30),
  ('career', 'Career', array['work', 'professional'], '#8b5cf6', 40),
  ('learning', 'Learning', array['creativity', 'education', 'study'], '#3b82f6', 50),
  ('finance', 'Finance', array['money', 'budget'], '#ec4899', 60),
  ('community', 'Community', array['volunteer'], '#14b8a6', 70),
  ('other', 'Other', array[]::text[], '#64748b', 999)
on conflict (key)
do update
set
  label = excluded.label,
  aliases = excluded.aliases,
  color = excluded.color,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.goal_categories enable row level security;

drop policy if exists goal_categories_select_authenticated
on public.goal_categories;
create policy goal_categories_select_authenticated
on public.goal_categories
for select
to authenticated
using (true);

revoke insert, update, delete on table public.goal_categories from anon;
revoke insert, update, delete on table public.goal_categories from authenticated;
grant select on table public.goal_categories to authenticated;

create or replace function private.normalize_goal_category_key(p_category text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select lower(btrim(coalesce(p_category, ''))) as category
  )
  select coalesce(
    (
      select gc.key
      from public.goal_categories gc
      join normalized n on true
      where n.category = lower(gc.key)
         or n.category = lower(gc.label)
         or exists (
           select 1
           from unnest(gc.aliases) as alias
           where n.category = lower(alias)
         )
      order by gc.sort_order asc, gc.key asc
      limit 1
    ),
    'other'
  );
$$;

alter table public.goals
add column if not exists category_key text;

create or replace function private.set_goal_category_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.category_key := private.normalize_goal_category_key(new.category);
  return new;
end;
$$;

drop trigger if exists goals_set_category_key
on public.goals;
create trigger goals_set_category_key
before insert or update of category
on public.goals
for each row execute function private.set_goal_category_key();

update public.goals
set category_key = private.normalize_goal_category_key(category)
where category_key is null;

alter table public.goals
alter column category_key set default 'other';

alter table public.goals
alter column category_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_category_key_fkey'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
    add constraint goals_category_key_fkey
    foreign key (category_key) references public.goal_categories(key) on update cascade;
  end if;
end;
$$;

create index if not exists goals_category_key_idx
on public.goals (category_key);
