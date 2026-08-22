-- Onboarding defaults:
-- Seed lightweight starter goals for users who opt in at signup.

create or replace function private.seed_default_onboarding_goals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed_default_goals boolean := false;
  v_anchor_date date;
begin
  select
    case
      when lower(coalesce(user_row.raw_user_meta_data->>'seed_default_goals', '')) in ('1', 't', 'true', 'yes')
        then true
      else false
    end
  into v_seed_default_goals
  from auth.users user_row
  where user_row.id = new.id;

  if coalesce(v_seed_default_goals, false) = false then
    return new;
  end if;

  -- If a row was backfilled for an existing account, do not duplicate starter data.
  if exists (
    select 1
    from public.goals goal
    where goal.owner_id = new.id
  ) then
    return new;
  end if;

  v_anchor_date := (new.created_at at time zone coalesce(new.timezone, 'UTC'))::date;

  insert into public.goals (
    id,
    owner_id,
    title,
    description,
    category,
    category_key,
    frequency_type,
    recurrence_interval,
    target_count,
    milestone_names,
    start_date,
    end_date,
    team_id,
    is_private,
    difficulty,
    is_deleted
  )
  values
    (
      gen_random_uuid(),
      new.id,
      'Create your Goalmaxxing account',
      'Complete profile basics and confirm your planner preferences.',
      'Personal',
      'personal',
      'fixed_milestones'::public.goal_frequency_type,
      null,
      1,
      array['Account setup complete'],
      v_anchor_date,
      v_anchor_date,
      null,
      false,
      'easy'::public.goal_difficulty,
      false
    ),
    (
      gen_random_uuid(),
      new.id,
      'Create your first goal',
      'Use New Goal + to add one real goal you want to complete this week.',
      'Personal',
      'personal',
      'fixed_milestones'::public.goal_frequency_type,
      null,
      1,
      array['First goal created'],
      v_anchor_date,
      v_anchor_date + 1,
      null,
      false,
      'easy'::public.goal_difficulty,
      false
    ),
    (
      gen_random_uuid(),
      new.id,
      'Invite your first teammate',
      'Open Community Team and send one partner invite.',
      'Relationships',
      'relationships',
      'fixed_milestones'::public.goal_frequency_type,
      null,
      1,
      array['Team invite sent'],
      v_anchor_date,
      v_anchor_date + 7,
      null,
      false,
      'easy'::public.goal_difficulty,
      false
    );

  return new;
end;
$$;

drop trigger if exists profiles_seed_default_onboarding_goals on public.profiles;
create trigger profiles_seed_default_onboarding_goals
after insert on public.profiles
for each row execute function private.seed_default_onboarding_goals();

revoke all on function private.seed_default_onboarding_goals() from public, anon, authenticated;
