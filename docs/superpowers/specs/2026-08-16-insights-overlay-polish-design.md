# Insights Overlay Polish Design

## Scope

Apply three follow-up UX corrections at the current PR-stack tip:

1. Eliminate horizontal page movement when any Radix Select or Dialog opens.
2. Match Goal Stats controls to the compact Checklist control pattern.
3. Consolidate each Insights goal title, badges, and Edit action into one header row.

## Overlay behavior

The existing source-only assertion verifies compensation declarations but does
not prove runtime geometry. Preserve modal scroll blocking while ensuring the
root scrollbar gutter and centered application bounds do not change when
`body[data-scroll-locked]` is applied. Cover both Select and Dialog with a
browser-level geometry regression.

## Goal Stats controls

Place an icon-only filter trigger immediately to the right of the period
stepper. Render This month, Next month, Year end, Month view, and Year view as
content-width `h-8` shaded pills in a horizontally scrollable row below the
header, matching Checklist. Keep category, ending month, sorting, view mode,
and past-goal visibility in the existing responsive filter sheet.

## Per-goal header

Render the color marker, goal title, category badge, and deadline badge in one
wrapping header group. Keep Edit/Done on the same top row and remove the
dedicated badge row. Narrow screens may wrap naturally without restoring a
separate metadata row.

## Verification

- Failing-then-passing overlay geometry regression for Select and Dialog.
- Component coverage for compact Goal Stats controls and filter placement.
- Component coverage for inline goal metadata.
- Web typecheck and lint.
