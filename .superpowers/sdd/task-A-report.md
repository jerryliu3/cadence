# PR A Report: Shared Duo Contracts + Route Auth Evidence

## Scope Delivered

Implemented PR A on `rn/duo-a-shared-contracts` as a behavior-preserving extraction of canonical Duo contracts/helpers into `@cadence/shared`, plus focused route-auth and partner-denial coverage for the audited endpoints.

## Contract Decisions

1. **Canonical Duo contracts moved to shared**
   - Added `@cadence/shared/social/duo` for:
     - `DuoScope`, `DuoAvailability`, active/pending/context types.
     - `DUO_SURFACE_DEFAULTS` and `resolveDuoSurfaceDefault`.
     - Pure scope/lane algorithms: `resolveEffectiveDuoScope`, `shouldClampDuoScopePreference`, `resolveDuoLanes`.

2. **Canonical team-state contracts moved to shared**
   - Added `@cadence/shared/social/team` for:
     - `TeamStateRow`, `SocialTeamStateResponse`, `TeamStateRpcRow`.
     - Pure mapping/projection helpers: `mapTeamStateRpcRow`, `toActiveTeamPartner`, `toPendingTeamInvite`, `buildDuoContextStateFromTeamRows`.
   - Reused these from route and server Duo loaders to remove duplicate DTO logic.

3. **Canonical progress contracts moved to shared**
   - Added `@cadence/shared/goals/progress-context` for:
     - `ProgressContextRequest`, `ProgressContextResponse`, `ProgressContextFact`, `ProgressContextSummary`.
     - Shared query builder `buildProgressContextQuery`.
   - Kept web I/O/caching/error classes web-owned in `src/lib/goals/progress-context.ts`.

4. **Viewer-goal filtering and subject-user selection moved to shared**
   - Added `@cadence/shared/goals/visible-goals` with:
     - `selectViewerVisibleGoals`
     - `progressSubjectUserId`

5. **Month-grid partner marker helpers moved to shared**
   - Added `@cadence/shared/planner/partner-completion` with:
     - `monthGridFactsBounds`
     - `buildPartnerCompletionMarkersByDate`
     - `mergeCompletionFactMarkers`

6. **Deleted local duplicate pure modules after caller migration**
   - Removed:
     - `src/lib/social/duo/types.ts`
     - `src/lib/social/duo/surface-defaults.ts`
     - `src/lib/goals/visible-goals.ts`
     - `src/features/planner/calendar-partner-overlay.ts`

## Route Auth + Denial Evidence

### Table-driven audited-route auth coverage

Added `src/app/api/duo-route-auth.test.ts` covering cookie + bearer success/failure across:
- `GET /api/social/team`
- `DELETE /api/social/team`
- `POST /api/social/team/invites`
- `POST /api/social/team/invites/[teamId]/accept`
- `POST /api/social/team/invites/[teamId]/decline`
- `POST /api/social/team/nudges`
- `GET /api/progress/context`

Bearer assertions explicitly verify `supabase.auth.getUser(token)` invocation (not only cookie auth mocks).

### Route-level partner denial collapse

Expanded `src/app/api/progress/context/route.test.ts` with table-driven assertions that partner denials all collapse to stable `403 not_team_partner` for:
- social disabled
- no active team
- wrong partner

## Files Changed

- `apps/mobile/src/features/checklist/use-checklist-data.ts`
- `apps/mobile/src/features/insights/InsightsScreen.tsx`
- `packages/shared/package.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/goals/progress-context.ts` (new)
- `packages/shared/src/goals/visible-goals.ts` (new)
- `packages/shared/src/planner/partner-completion.ts` (new)
- `packages/shared/src/social/duo.ts` (new)
- `packages/shared/src/social/team.ts` (new)
- `src/app/api/duo-route-auth.test.ts` (new)
- `src/app/api/progress/context/route.test.ts`
- `src/app/api/progress/context/route.ts`
- `src/app/api/social/team/route.ts`
- `src/components/layout/app-shell.tsx`
- `src/features/insights/insights-shell.tsx`
- `src/features/insights/use-insights-data.ts`
- `src/features/planner/calendar-page-shell.tsx`
- `src/features/planner/calendar-partner-overlay.test.ts`
- `src/features/planner/calendar-surface.tsx`
- `src/features/planner/use-partner-completion-overlay.ts`
- `src/features/social/data.ts`
- `src/features/social/duo/duo-context.tsx`
- `src/features/social/duo/duo-lanes.tsx`
- `src/features/social/duo/duo-scope-toggle.tsx`
- `src/features/social/duo/partner-checklist-strip.tsx`
- `src/features/social/team/team-panel.tsx`
- `src/features/social/types.ts`
- `src/features/today/checklist-shell.tsx`
- `src/features/today/today-tab.tsx`
- `src/features/today/use-checklist-data.ts`
- `src/lib/goals/progress-context.ts`
- `src/lib/goals/visible-goals.test.ts`
- `src/lib/social/duo/load-duo-context.ts`
- `src/lib/social/duo/scope-cookie.ts`
- `src/lib/social/duo/surface-defaults.test.ts`
- `src/lib/social/team.ts`
- deleted `src/features/planner/calendar-partner-overlay.ts`
- deleted `src/lib/goals/visible-goals.ts`
- deleted `src/lib/social/duo/surface-defaults.ts`
- deleted `src/lib/social/duo/types.ts`

## Verification Commands + Results

1. `pnpm exec vitest --run src/lib/social/duo/surface-defaults.test.ts src/lib/goals/visible-goals.test.ts src/features/planner/calendar-partner-overlay.test.ts src/app/api/duo-route-auth.test.ts src/app/api/progress/context/route.test.ts`
   - **Result:** pass (`5` files, `27` tests).

2. `pnpm typecheck`
   - **Result:** pass.

3. `pnpm --filter @cadence/mobile typecheck`
   - **Result:** pass.

4. `pnpm lint`
   - **Result:** pass with warnings only (no errors).
   - Warnings are existing-style unused symbol warnings in planner surface/type files.

## Commit(s)

- Pending commit hash insertion after commit.

## Concerns

- No behavior regressions observed in targeted tests.
- `pnpm lint` still reports warnings (no blocking errors).
