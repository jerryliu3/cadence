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
3. `pnpm test`
4. `pnpm lint`
5. `pnpm typecheck`

Pass criteria:

- all planner migrations apply cleanly from empty local state,
- SQL tests pass without manual database intervention,
- API/unit tests remain green.

## 4) Rollback procedure (forward-only schema)

Do not down-migrate planner history tables.

If planner incidents occur:

1. Set `CALENDAR_ENABLED=false` to disable planner reads/writes and Calendar UI.
2. Set `CALENDAR_COACH_AI_ENABLED=false` to disable coach requests.
3. Redeploy the last known bridge-compatible app build.
4. Keep execution history tables intact for forensic analysis.

## 5) Dashboard/query checklist

Create saved queries from your runtime logs for:

- preview totals, success rate, conflict/error rate,
- publish totals, success/conflict/error rate,
- mutation error rates by `data.action`,
- staleness reason frequencies,
- targeted completion failures by `errorCode`,
- AI latency (`durationMs`) and quota rejects (`result=quota_rejected`).

Example filters (adapt to your logging backend):

- `line contains "[planner-telemetry]" AND json.eventName="planner.publish.completed"`
- `line contains "[planner-telemetry]" AND json.eventName="planner.invariant.failed"`
- `line contains "[planner-telemetry]" AND json.eventName="ai.request.completed" AND json.result!="success"`

## 6) Alert thresholds

Start with these minimum alerts:

- any `planner.invariant.failed` in production,
- any cross-owner/isolation error code if observed,
- sustained `planner.publish.completed` failures above 1% excluding expected `stale_revision`,
- sustained AI request error rate above 5%,
- repeated `response_bound_exceeded` failures (signals fail-closed read pressure).

## 7) Controlled enablement order

1. Keep coach disabled (`CALENDAR_COACH_AI_ENABLED=false`) while manual planner soaks.
2. Enable manual planner cohort first (`CALENDAR_ENABLED=true` for internal users).
3. Observe telemetry and query panels through soak window.
4. Enable coach only after manual planner stability is established.
