# Planner Stack Follow-up Findings and Remediation

This document consolidates confirmed findings from the deep review pass and
maps each fix to the stacked planner PR chain.

## Stack Order

- PR352 `planner/range-write-boundary`
- PR353 `planner/window-contracts-kernel`
- PR354 `planner/global-draft-and-window-save`
- PR355 `planner/coach-window-cutover`
- PR356 `planner/month-path-cleanup`
- PR385 `planner/month-path-cleanup-followup-prepare-resilience`
- PR386 `planner/coach-sessionref-resolution`

## Findings Matrix

| ID | Finding | Severity | Branch / PR | Remediation | Status |
| --- | --- | --- | --- | --- | --- |
| F1 | `set_planner_schedule_batch` added then removed in-chain | Medium | PR352 + PR354 | Removed batch function from boundary migration and removed paired drop migration | Completed |
| F2 | GET context accepts visible range pair/order but not explicit span guard | Medium | PR353 | Added explicit route-level `MAX_PLANNER_WINDOW_DAYS` validation and test coverage | Completed |
| F3 | Mixed `policy + move_item` save can take direct branch semantics | High | PR354 | Forces kernel-validated save when a policy payload is present | Completed |
| F4 | Save request branch duplication in calendar save flow obscures contract | Medium | PR354 | Centralized save request shaping and removed duplicated branch payload construction | Completed |
| F5 | Duplicate planner item validation logic in `set_planner_schedule` and `prepare_planner_schedule` | Medium | PR356 | Extracted shared private SQL item payload validation helper | Completed |
| F6 | Duplicate prepare migration body split across `20260814045533` and `20260814051510` | Medium | PR356 | Reduced duplicate validation sections by delegating to shared helpers | Completed |
| F7 | Rebuild schedule can run while draft exists and force-prepare baseline | High | PR385 | Rebuild action disabled while draft exists, with explanatory copy | Completed |
| F8 | `invalid_lock` durable state can remain converged after lock condition changes | High | PR385 | Added `lock_signature` durable validity key and convergent re-solve behavior | Completed |
| F9 | Dead drop statement for nonexistent prepare signature in unplaceable migration | Low | PR385 | Removed dead drop line from migration | Completed |
| F10 | Decision doc remains untracked | Low | PR385 | Added `docs/planner_prepare_outcome_decision.md` with lock-signature decision updates | Completed |
| F11 | Coach resolution failure copy conflates session-ref, ambiguity, and not-found paths | Low | PR386 | Split warning copy by resolution failure mode | Completed |
| F12 | `MAX_COACH_FOCUS_GOALS` duplicated between server and client modules | Low | PR386 | Moved to shared `coach-constants` module | Completed |
| F13 | `compileCalendarIntent` move resolution path is overly nested | Low | PR386 | Extracted focused move-resolution helper and simplified intent compilation loop | Completed |
| F14 | Dead/over-exported TS APIs (`diff`, `draft-window`, `work-units`, `unplaceable`) | Low | Tip | Removed dead exports and throw-wrapper-only APIs/tests | Completed |

## Restack Sequence Applied

After each base-branch edit, descendants were restacked in stack order:

1. PR352 change -> restack 353 -> 354 -> 355 -> 356 -> 385 -> 386
2. PR353 change -> restack 354 -> 355 -> 356 -> 385 -> 386
3. PR354 change -> restack 355 -> 356 -> 385 -> 386
4. PR356 change -> restack 385 -> 386
5. PR385 change -> restack 386

## Lower-Priority / Deferred Disposition

- No findings were deferred; all accepted correctness and simplification items were implemented in-stack.
- Type strictness drift discovered during final verification (fixture payload shape + lock signature typing) was fixed at tip to keep stack and CI gates coherent.

## Verification Evidence

- `pnpm vitest src/app/api/planner/context/route.get.test.ts src/app/api/planner/save/route.test.ts src/lib/planner/prepare.test.ts src/lib/planner/unplaceable.test.ts src/lib/planner/coach-sanitize.test.ts src/app/api/planner/coach/route.test.ts src/lib/planner/draft-window.test.ts src/lib/planner/work-units.test.ts src/features/planner/calendar-surface.characterization.test.tsx src/features/planner/planner-save-request.test.ts` -> **pass** (10 files, 85 tests)
- `pnpm vitest src/features/planner/calendar-store-selectors.test.ts src/features/planner/calendar-surface.characterization.test.tsx src/features/planner/planner-save-request.test.ts src/app/api/planner/context/route.get.test.ts` -> **pass** (4 files, 18 tests)
- `pnpm test:sql` -> **pass** (planner write boundary, prepare boundary, and unplaceable pgTAP suites passing, along with full SQL test set)
- `pnpm typecheck` -> **pass**

## Verification Checklist

- Targeted Vitest for touched route/surface/prepare/coach modules
- pgTAP for changed SQL boundaries
- Lint/type checks for touched files
- Record command outputs and final status per finding
