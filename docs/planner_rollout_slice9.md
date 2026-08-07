# Planner Slice 9 Rollout Guide

This document covers the operational gates introduced for Slice 9:

- telemetry emission for planner and AI routes,
- migration rehearsal and rollback workflow,
- dashboard/query definitions for soak readiness,
- controlled feature enablement progression.

## 1) Telemetry prerequisites

Set these server-side environment variables before enabling wider cohorts:

- `PLANNER_TELEMETRY_HMAC_KEY`: minimum 32 characters, server-only secret.
- `PLANNER_TELEMETRY_HMAC_KEY_VERSION`: positive integer key version (default `1`).
- `CALENDAR_TELEMETRY_COHORT`: short cohort label (default `internal`).
- `PLANNER_OVERLAP_ENABLED`: optional emergency override (`false`) to disable default-on overlap eligibility during incident response.

Telemetry emits structured JSON log lines prefixed with `[planner-telemetry]`.
Owner identifiers are never logged directly; events use HMAC pseudonyms.

## 2) Events expected during soak

The frozen catalog is:

- `planner.preview.completed`
- `planner.publish.completed`
- `planner.mutation.completed`
- `planner.staleness.detected`
- `planner.invariant.failed`
- `targeted_completion.completed`
- `ai.request.completed`

## 3) Migration rehearsal procedure

Run this exact sequence before broadening cohorts:

1. `pnpm supabase:reset`
2. `pnpm test:sql`
3. `pnpm test:concurrency`
4. `pnpm contracts:check`
5. `pnpm test:benchmark`
6. `supabase db lint`
7. `supabase db advisors`
8. `pnpm test`
9. `pnpm lint`
10. `pnpm typecheck`

Pass criteria:

- all planner migrations apply cleanly from empty local state,
- SQL tests pass without manual database intervention,
- concurrency harness and contract drift checks pass,
- benchmark fixture completes under expected runtime bounds,
- `supabase db lint` and `supabase db advisors` report no unreviewed blockers,
- API/unit tests remain green.

## 4) Rollback procedure (forward-only schema)

Do not down-migrate planner history tables.

If planner incidents occur:

1. Set `CALENDAR_ENABLED=false` to disable planner reads/writes and Calendar UI.
2. Redeploy the last known bridge-compatible app build.
3. Keep execution history tables intact for forensic analysis.

## 5) Dashboard/query checklist

Create saved queries from your runtime logs for:

- preview totals, success rate, conflict/error rate,
- publish totals, success/conflict/error rate,
- publish timed-session coverage (`counts.timedUnits / counts.workUnits`) and drift over time,
- mutation error rates by `data.action`,
- staleness reason frequencies,
- targeted completion failures by `errorCode`,
- AI latency (`durationMs`) and quota rejects (`result=quota_rejected`),
- manual planner generation p95 latency (`planner.preview.completed`, `result=success`).

Example filters (adapt to your logging backend):

- `line contains "[planner-telemetry]" AND json.eventName="planner.publish.completed"`
- `line contains "[planner-telemetry]" AND json.eventName="planner.invariant.failed"`
- `line contains "[planner-telemetry]" AND json.eventName="ai.request.completed" AND json.result!="success"`

## 6) Alert thresholds

Start with these minimum alerts:

- any `planner.invariant.failed` in production,
- any cross-owner/isolation error code if observed,
- sustained `planner.publish.completed` failures above 1% excluding expected `stale_revision`,
- sustained `time_validation_failed` publish rejections above baseline,
- sustained AI request error rate above 5%,
- repeated `response_bound_exceeded` failures (signals fail-closed read pressure).
- `planner.preview.completed` p95 latency above 2 seconds for manual generation during soak.

## 7) Controlled enablement order

1. Enable manual planner cohort first (`CALENDAR_ENABLED=true` for internal users).
2. Observe telemetry and query panels through soak window.
3. Expand broader cohorts only after manual planner stability is established.
4. Treat overlap as default-on baseline; use `PLANNER_OVERLAP_ENABLED=false` only as a rollback kill switch. Note that cross-month draft persistence remains intentionally guarded by month-scope lineage checks until the dedicated persistence expansion lands.
