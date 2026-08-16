-- Additive notification preference categories for push delivery.

alter table public.profiles
add column if not exists notification_preferences jsonb;

update public.profiles
set notification_preferences = jsonb_build_object(
  'daily_reminders', true,
  'team_updates', true,
  'partner_activity', true
)
where notification_preferences is null;

alter table public.profiles
alter column notification_preferences
set default jsonb_build_object(
  'daily_reminders', true,
  'team_updates', true,
  'partner_activity', true
);

alter table public.profiles
alter column notification_preferences
set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_notification_preferences_object'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_notification_preferences_object
    check (jsonb_typeof(notification_preferences) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_notification_preferences_daily_reminders_bool'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_notification_preferences_daily_reminders_bool
    check (
      notification_preferences ? 'daily_reminders'
      and jsonb_typeof(notification_preferences -> 'daily_reminders') = 'boolean'
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_notification_preferences_team_updates_bool'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_notification_preferences_team_updates_bool
    check (
      notification_preferences ? 'team_updates'
      and jsonb_typeof(notification_preferences -> 'team_updates') = 'boolean'
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_notification_preferences_partner_activity_bool'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_notification_preferences_partner_activity_bool
    check (
      notification_preferences ? 'partner_activity'
      and jsonb_typeof(notification_preferences -> 'partner_activity') = 'boolean'
    );
  end if;
end;
$$;
