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
- iOS/Android binaries: EAS cloud builds (`apps/mobile/eas.json`)
- Updates: EAS Update channels `development`, `preview`, `production`
- Force upgrade: `MOBILE_MIN_SUPPORTED_APP_VERSION` on `/api/config`
