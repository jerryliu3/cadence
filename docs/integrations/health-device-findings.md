# Health device-truth findings (Wave 1 PR0)

Wave 1 ships Apple HealthKit and Android Health Connect only. This note
locks the schema branching decision before PR1.

Physical-device runs remain a later TestFlight / Play gate (PR4/PR5/PR8).
This decision is based on current platform API contracts, not a substitute
for those device gates.

## Branching decision

**Keep the full dedup schema in PR1/PR2.**

Land `health_activities`, `health_activity_groups`, `health_source_priority`,
canonical election constraints, and the source-priority + fuzzy ingest path.
Do **not** reduce PR1 to `health_activities` + `health_daily_metrics` only.

Reason: the client ingest contract uses incremental raw samples (HealthKit
anchored queries, Health Connect `getChanges`). Those surfaces return
per-source records. Platform aggregate queries can hide overlap for some
quantity types, but they are not the Wave 1 sync path and they do not
produce a stable canonical activity row we can complete goals from.

## HealthKit source visibility

- `HKSampleQuery` / `HKAnchoredObjectQuery` return matching samples from
  **all** readable sources (iPhone, Apple Watch, third-party apps). Summing
  those samples double-counts overlapping step / energy windows.
- `HKStatisticsQuery` / `HKStatisticsCollectionQuery` apply Apple's
  source-priority overlap rules (Health app Data Sources order). That is
  useful for a daily total, not for identity-preserving ingest.
- Wave 1 sync is anchored and background-delivered. Anchored queries are
  sample-level, so server-side source-priority exclusion plus fuzzy overlap
  remains required even if a later read path also uses statistics queries.

## Unauthorized HealthKit type reads

- Reading a type that is not authorized, or requesting a type that is not
  in the App ID HealthKit entitlement, can throw and in some SDK paths
  abort the process.
- PR4 must wrap authorization and per-type reads so an unauthorized type
  cannot crash the app. Treat missing authorization as an empty/error
  result, never as an uncaught native exception.

## Health Connect SPN (Synthetic Package Name)

As of the Health Connect update on 2026-06-20, on-device steps are no
longer attributed only to `DataOrigin("android")`:

- Historical pre-change rows may still use package name `android`.
- New on-device rows use a device-specific synthetic package name (SPN),
  for example `com.android.healthconnect.phone.<id>`.
- `HealthConnectManager.getCurrentDeviceDataSource()` is the supported way
  to resolve the current SPN. It is not present on every Play Services /
  SDK combination; callers must feature-detect.

PR5 must treat source identity as `metadata.dataOrigin.packageName` plus
optional device metadata. Never assume a single `DataOrigin("android")`
filter covers current on-device steps.

## Manual gates still required

These are **not** closed by this document:

- HealthKit background delivery on a physical iPhone, including the EAS
  `com.apple.developer.healthkit.background-delivery` capability-sync trap.
- Health Connect SPN + `getChanges` on current Android / Play Services.
- Unauthorized-type crash guards on device.

Until those gates pass, keep `INTEGRATIONS_ENABLED` default-off.
