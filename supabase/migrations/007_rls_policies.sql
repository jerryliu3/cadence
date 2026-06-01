alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.completions enable row level security;
alter table public.goal_links enable row level security;
alter table public.goal_participants enable row level security;
alter table public.goal_shares enable row level security;

create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "goals_select_related_users"
on public.goals
for select
to authenticated
using (public.can_view_goal(id, auth.uid()));

create policy "goals_insert_owner_only"
on public.goals
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "goals_update_owner_only"
on public.goals
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "goals_delete_owner_only"
on public.goals
for delete
to authenticated
using (owner_id = auth.uid());

create policy "completions_select_viewable_goal"
on public.completions
for select
to authenticated
using (public.can_view_goal(goal_id, auth.uid()));

create policy "completions_insert_by_actor"
on public.completions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_complete_goal(goal_id, auth.uid())
);

create policy "completions_delete_by_actor"
on public.completions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.can_complete_goal(goal_id, auth.uid())
);

create policy "goal_links_owner_select"
on public.goal_links
for select
to authenticated
using (owner_id = auth.uid());

create policy "goal_links_owner_insert"
on public.goal_links
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "goal_links_owner_update"
on public.goal_links
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "goal_links_owner_delete"
on public.goal_links
for delete
to authenticated
using (owner_id = auth.uid());

create policy "goal_participants_select_related"
on public.goal_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.goals g
    where g.id = goal_participants.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_participants_owner_insert"
on public.goal_participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.goals g
    where g.id = goal_participants.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_participants_owner_update"
on public.goal_participants
for update
to authenticated
using (
  exists (
    select 1
    from public.goals g
    where g.id = goal_participants.goal_id
      and g.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.goals g
    where g.id = goal_participants.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_participants_delete_owner"
on public.goal_participants
for delete
to authenticated
using (
  exists (
    select 1
    from public.goals g
    where g.id = goal_participants.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_participants_leave_group"
on public.goal_participants
for delete
to authenticated
using (user_id = auth.uid());

create policy "goal_shares_select_related"
on public.goal_shares
for select
to authenticated
using (
  shared_with = auth.uid()
  or exists (
    select 1
    from public.goals g
    where g.id = goal_shares.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_shares_owner_insert"
on public.goal_shares
for insert
to authenticated
with check (
  exists (
    select 1
    from public.goals g
    where g.id = goal_shares.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_shares_owner_update"
on public.goal_shares
for update
to authenticated
using (
  exists (
    select 1
    from public.goals g
    where g.id = goal_shares.goal_id
      and g.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.goals g
    where g.id = goal_shares.goal_id
      and g.owner_id = auth.uid()
  )
);

create policy "goal_shares_owner_delete"
on public.goal_shares
for delete
to authenticated
using (
  exists (
    select 1
    from public.goals g
    where g.id = goal_shares.goal_id
      and g.owner_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'goal-photos',
  'goal-photos',
  false,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "goal_photos_select_if_viewable"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'goal-photos'
  and exists (
    select 1
    from public.goals g
    where g.photo_path = storage.objects.name
      and public.can_view_goal(g.id, auth.uid())
  )
);

create policy "goal_photos_insert_owner_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'goal-photos'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "goal_photos_update_owner_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'goal-photos'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'goal-photos'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "goal_photos_delete_owner_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'goal-photos'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);
