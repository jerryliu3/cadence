do $$
begin
  if not exists (
    select 1
    from pg_type enum_type
    join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    where enum_type.typnamespace = 'public'::regnamespace
      and enum_type.typname = 'social_audience_kind'
      and enum_value.enumlabel = 'group'
  ) then
    alter type public.social_audience_kind add value 'group';
  end if;

  if not exists (
    select 1
    from pg_type enum_type
    join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    where enum_type.typnamespace = 'public'::regnamespace
      and enum_type.typname = 'leaderboard_scope_kind'
      and enum_value.enumlabel = 'group'
  ) then
    alter type public.leaderboard_scope_kind add value 'group';
  end if;
end;
$$;

alter table public.challenges
  drop constraint if exists challenges_cohort_required;
alter table public.challenges
  add constraint challenges_cohort_required
  check (
    (audience_kind = 'global'::public.social_audience_kind and cohort_id is null)
    or (
      audience_kind in ('cohort'::public.social_audience_kind, 'group'::public.social_audience_kind)
      and cohort_id is not null
    )
  );

alter table public.leaderboard_seasons
  drop constraint if exists leaderboard_seasons_scope_cohort_required;
alter table public.leaderboard_seasons
  add constraint leaderboard_seasons_scope_cohort_required
  check (
    (scope = 'global'::public.leaderboard_scope_kind and cohort_id is null)
    or (
      scope in ('cohort'::public.leaderboard_scope_kind, 'group'::public.leaderboard_scope_kind)
      and cohort_id is not null
    )
  );
