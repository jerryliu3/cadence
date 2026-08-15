# Health Connect Play review

Do **not** submit the Play Health apps declaration until the privacy-policy
intent is verified on a physical device.

## Required intent routing

Play's Health Connect permission sheet includes a privacy-policy link that
sends `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (and on Android 14+
`VIEW_PERMISSION_USAGE` / `HEALTH_PERMISSIONS`).

That intent must open **policy content**, not a cold launch into
`MainActivity`.

Cadence handles this in JS:

- `apps/mobile/src/features/health/privacy-policy-intent.ts` recognizes the
  rationale action.
- `apps/mobile/app/privacy.tsx` renders the policy copy.
- `apps/mobile/app.json` registers the Android intent filter.

## Device verification

1. Install a Play-internal or sideloaded build with Health Connect permissions.
2. Open Health Connect → App permissions → Cadence → Privacy policy.
3. Confirm the in-app `/privacy` screen appears (not the login/tabs shell).
4. Only then file the Play Health apps declaration.

## Source package names

On-device steps may use `DataOrigin("android")` historically and a device
synthetic package name (SPN) after the 2026-06-20 Health Connect change.
Never filter only `android`. See `docs/integrations/health-device-findings.md`.
