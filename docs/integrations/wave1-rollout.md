# Health Wave 1 staged rollout

`INTEGRATIONS_ENABLED` stays default **off**. Promote stages with env, not a
second product flag.

| Stage | Env | Who |
| --- | --- | --- |
| Off | `INTEGRATIONS_ENABLED=false`, `INTEGRATIONS_ROLLOUT_STAGE=off` | Nobody. APIs return `integrations_disabled`. |
| Internal | Flag on, `INTEGRATIONS_ROLLOUT_STAGE=internal`, `INTEGRATIONS_ALLOWED_USER_IDS=<comma-separated uuids>` | Named operator accounts only. |
| Beta | Flag on, stage `beta`, empty allowlist | TestFlight / Play internal testing tracks. |
| GA | Flag on, stage `ga`, empty allowlist | General availability. |

`/api/config` returns `integrationsEnabled` and `integrationsRolloutStage`.
Health routes still 503 when the flag is off or the user is not on the
internal allowlist.

## Promotion checklist

1. Internal: device-truth gates in `health-device-findings.md` still open until
   TestFlight/Play hardware runs. Enable the flag + allowlist for operators.
2. Beta: EAS HealthKit capability dry run (`docs/integrations/healthkit-eas-capability.md`)
   and Health Connect privacy-intent device check
   (`docs/integrations/health-connect-play-review.md`).
3. GA: approvals in `docs/integrations/approvals-checklist.md` complete, Sentry
   `health.*` noise reviewed, stale/error copy verified in Integrations settings.

## Rollback

Set `INTEGRATIONS_ENABLED=false`. In-flight clients get 503. Existing
completions remain; reconnect after the flag is restored.
