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
