# Mobile migration plan

Cadence keeps the Next.js web app at repo root and adds a first-class Expo
Router client in `apps/mobile`. Shared contracts live in `packages/shared`.

## Completed phases

- **C0** Workspace globs, `tsconfig.base.json`, `@cadence/shared` scaffold.
- **C1** Dual cookie + bearer API auth with `getUser(accessToken)` in bearer mode.
- **C2** Expo tracer (superseded by the C6 shell).
- **C3 / C5e** Shared API client + `createApiClient()` with one 401 retry.
- **C4** `GET /api/config` for flags and `minSupportedAppVersion`.
- **C5** Tokens, tab metadata, calendar state, cache/XP/haptics seams, planner helper extraction.
- **C6** Auth stack, tabs, form-sheet goals, config/upgrade gate, `cadence://` redirects.
- **C7** Checklist completions, goal CRUD, ArrayBuffer photo upload.
- **C8** Store-backed calendar, sheet moves, drag/reorder, coach, and cross-month drops.
- **C9** Insights SVG heatmap, social flag gate, native push schema + Expo send path.
- **C10** EAS profiles, docs, and `verify-mobile-static` CI job.

## Unresolved blockers

- Hosted Supabase Auth additional redirect URLs must include `cadence://` in production, not only `supabase/config.toml`.
- APNs / FCM / EAS credentials and `EXPO_TOKEN` are operator setup, not in git.
- Native push requires a physical device and a migrated `push_subscriptions` table.
- Calendar save/publish hash confirmation is thinner on mobile than web.

## Accepted intentional divergences from web UX

- Tooltips are omitted on mobile.
- View Transitions are not ported.
- Calendar uses a 7-column flex grid, not CSS Grid.
- Colors use shared hex tokens; web keeps `oklch()` in CSS.
- Offline mutation queues are out of scope.
- Admin and bulk CSV/XLSX remain web-only.

## Release

- Local static gate: `pnpm --filter @cadence/mobile typecheck`
- Local mobile Duo verification: `pnpm --filter @cadence/mobile exec vitest run`
- iOS/Android binaries: EAS cloud builds (`apps/mobile/eas.json`)
- Updates: EAS Update channels `development`, `preview`, `production` (disabled in `app.json` until a real EAS project id replaces the placeholder URL)
- Force upgrade: `MOBILE_MIN_SUPPORTED_APP_VERSION` on `/api/config`

### Duo acceptance checklist

1. Pair two users into an active team and verify Checklist/Insights/Calendar
   scope toggles all render `me`, `both`, and `partner` correctly.
2. Confirm partner lanes are read-only (no goal writes, no viewer drag/move/lock/reset
   affordances in partner calendar scope).
3. Validate fail-closed behavior by forcing partner fetch failures:
   - partner overlays clear while loading new partner/month keys,
   - partner errors show concise unavailable copy,
   - viewer lanes remain interactive in `both`.
4. Confirm mobile telemetry in Sentry (when DSN is configured):
   `scope_viewed`, `partner_fetch_failed`, `viewer_lane_completion`,
   `partner_strip_open`, `post_dissolution_scope_clamp`.

### Mobile Sentry env notes

- `EXPO_PUBLIC_SENTRY_DSN` is optional. If empty, mobile Sentry is fully disabled
  (no init and no Duo capture calls).
- `EXPO_PUBLIC_SENTRY_ENVIRONMENT` is optional and should be set per EAS channel
  (`preview` for preview builds, `production` for production builds) when DSN is enabled.

### Native module note

Adding `@sentry/react-native` requires rebuilding the Expo dev-client before local
runtime validation (`pnpm --filter @cadence/mobile ios` / `android` or EAS build).
