# Health Wave 1 approvals checklist

Non-code lane. Engineering can ship behind `INTEGRATIONS_ENABLED=false` while
these stay open.

## Apple

- [ ] Health data usage disclosure copy finalized for App Store review.
- [ ] App ID has HealthKit **and** HealthKit Background Delivery (EAS does not
      auto-sync background delivery — see `healthkit-eas-capability.md`).
- [ ] First TestFlight build inspected with `EXPO_DEBUG=1` / escape hatch
      `EXPO_NO_CAPABILITY_SYNC=1` if capability sync is wrong.

## Google Play

- [ ] Privacy-policy intent verified on a physical device
      (`health-connect-play-review.md`).
- [ ] Health apps declaration filed **only after** that device check.
- [ ] Declaration review timeline tracked separately from code freeze.

## COROS (optional, not a Wave 1 dependency)

- [ ] API application submitted if we want the option later.
- [ ] No Wave 1 schema, OAuth, or ingest work for COROS.

## Garmin (monitor only)

- [ ] Watch Garmin intake reopening.
- [ ] No Wave 1 Garmin server integration, tokens, or client OAuth.

## Explicitly out of scope

Strava server integration, generic OAuth connection substrate, Fitbit Web API
migration, and cross-user raw health metrics.
