# Synthetic Social Ops

This system seeds synthetic users and runs a lightweight activity tick to keep the Community tab active at launch.

## Current Defaults

- `provision_synthetic_users_service()` defaults to **10 users** and **6 goals per user**.
- Persona split keeps the same 40/40/20 ratio at any target count:
  - low activity: 40%
  - medium activity: 40%
  - high activity: 20%
- Generated synthetic profiles use realistic North America names, deterministic usernames, and persona archetypes.
- Synthetic goals are private (`goals.is_private = true`) and generated uniquely (no title overlap within a provisioning run).
- Synthetic accounts keep `social_activity_visible = true` so their activity appears in feed/leaderboard/challenge surfaces.

## Components

- `public.synthetic_users`: synthetic account roster, persona, and daily budget.
- `public.synthetic_config`: single-row config + global kill switch.
- `public.provision_synthetic_users_service(target_count, goals_per_user)`: creates synthetic auth users, profiles, goals, and challenge participants.
- `public.synthetic_activity_tick_service()`: emits bounded daily completions and feed reactions.
- `supabase/scripts/synthetic_social_backfill.sql`: one-time 14-day historical backfill.

## Launch Steps

1. Run migrations.
2. Run one-time backfill script:
   - `psql "$SUPABASE_DB_URL" -f supabase/scripts/synthetic_social_backfill.sql`
3. Confirm cron job exists:
   - `synthetic-social-activity`
4. Sanity check in SQL:
   - `select count(*) from public.synthetic_users where enabled = true;`
   - `select persona, count(*) from public.synthetic_users group by persona order by persona;`
   - `select public.synthetic_activity_tick_service();`

## Scale Up Later

To expand from 10 users to 100+ users later, rerun provisioning with a higher target:

```sql
select public.provision_synthetic_users_service(100, 6);
```

The function is idempotent and keeps deterministic identities while extending the synthetic population.

## Disable Options

Pause all synthetic activity immediately:

```sql
update public.synthetic_config
set enabled = false
where id = 1;
```

Disable all synthetic users:

```sql
update public.synthetic_users
set enabled = false;
```

Hide all synthetic users from social surfaces:

```sql
update public.profiles profile
set social_activity_visible = false
from public.synthetic_users synthetic
where synthetic.user_id = profile.id;
```

## Ramp-Down Strategy

- Use `throttle_above_real_dau` in `public.synthetic_config` to auto-pause ticks when real daily active users are high enough.
- Keep synthetic accounts disabled (not deleted) so re-enable is trivial during rollback scenarios.
