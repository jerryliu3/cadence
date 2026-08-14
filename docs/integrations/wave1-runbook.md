# Health Wave 1 runbook

Use this when ingest, auto-complete, or disconnect misbehaves. Do not query or
paste raw health values into tickets, Slack, or Sentry notes.

## Where to look

- Sentry breadcrumbs: `category=health` with `ingestedCount`, `canonicalCount`,
  `suppressedCount`, `autocompleteAppliedCount`, `deletedCount`.
- Sentry messages: `health.disconnect`, `health.sync_failure`.
- API correlation IDs on `/api/health/*` error payloads.
- `health_sync_state.last_error` (message only, no sample payloads).
- Feature flag: `INTEGRATIONS_ENABLED` (default off).
- Cohort: `INTEGRATIONS_ROLLOUT_STAGE` (`off` / `internal` / `beta` / `ga`) and
  optional `INTEGRATIONS_ALLOWED_USER_IDS`.

## Ingest

1. Confirm `INTEGRATIONS_ENABLED=true` and the user is on the allowlist when
   the internal stage is active.
2. Check `/api/health/status` for `never_asked` / `asked` / `receiving_data` /
   `stale` plus `lastError`.
3. If ingest returns `health_ingest_failed`, inspect Sentry for the correlation
   ID. Dedup outcomes are counts only.
4. Mobile: foreground AppState, HealthKit `subscribeToChanges`, and the
   Integrations resync button all post to `/api/health/samples`. iOS uses
   HealthKit anchors; Android uses `readRecords` for the first/expired
   token window and `getChanges` afterward. Disconnect clears those local
   tokens and stops automatic sync until the user connects again.

## Auto-complete

- Rules are opt-in per goal/metric/threshold.
- Completions use `external_sync` for today and yesterday only, keyed by
  `health:{metric}:{local_date}:{goal_id}`.
- Unmark writes a tombstone; auto-complete will not resurrect that day.

## Disconnect

- `POST /api/health/disconnect` deletes that provider's `health_activities`,
  re-elects remaining rows, recomputes daily metrics, and clears
  `health_sync_state`.
- Device permissions stay until the user revokes them in Apple Health or
  Health Connect **and restarts the app**. Do not call `revokeAllPermissions`
  as an in-app toggle.

## Privacy

Social, duo, and leaderboard surfaces may show derived XP/rank/streak only.
Never add `health_daily_metrics` or sample values to those APIs.
