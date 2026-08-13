# Duo rollout notes

Native solo/duo is derived from an **active** `teams` row. There is no stored
`user_mode`. Partner checklist/insights/calendar overlays are read-only.
`is_private` only masks public feed titles; it does not hide content from an
active team partner.

## Production gate before visibility migration

The `can_view_goal_content` team branch no longer consults `goals.is_private`.
Before deploying that migration to production:

1. Count active teams:

   ```sql
   select count(*) from public.teams where status = 'active';
   ```

2. If the count is **non-zero**, ship the UI re-consent / visibility
   acknowledgement path in the **same** release, or stage the migration behind a
   temporary guard until operators confirm pairing consent is already recorded
   (`teams.visibility_acknowledged_at`).

3. Keep a PITR/backup restore path. These migrations are forward-only.

Apply SQL in order: **duo1 → duo2 → duo3** (then duo4+). Duo3 exposes
`week_starts_on` on the partner profile projection. Partner progress reads
fail closed with HTTP 500 if that key is missing, so shipping duo1/duo2
without duo3 breaks every partner Checklist/Insights load rather than
degrading to a wrong weekly anchor.

## Social-enabled UI gate

Duo context loading and partner progress reads stay behind `socialEnabled`.
Until dual-subject `/api/progress/context?subjectUserId=` reads are verified in
the target environment:

- leave `socialEnabled` off
- confirm partner 403s collapse to `not_team_partner` (no pairing-state leak)
- confirm progress cache keys include `subjectUserId` and invalidate on
  dissolve/decline

## Telemetry (Sentry)

Emitted only when `NEXT_PUBLIC_SENTRY_DSN` is set. Breadcrumbs are always
recorded. `scope_viewed` `captureMessage` is sampled at 10% so usage mix is
visible without an event per surface visit. Other duo events always capture.

| Event | Meaning |
| --- | --- |
| `scope_viewed` | Surface + scope + device class |
| `partner_fetch_failed` | Partner progress read failed; `stalePartner` when code is `not_team_partner` |
| `viewer_lane_completion` | Viewer completed from Checklist |
| `partner_strip_open` | User opened partner checklist from the me-scope strip |
| `post_dissolution_scope_clamp` | Cookie scope was partner/both after the team dissolved |

Partner-lane fetch failures also go through `reportError` with `area: "duo"`.

## Out of scope

- Partner writes to checklist/goals
- Planner proposal collaboration / dual-lane calendar editing
- Partner data in the viewer planner draft reducer
