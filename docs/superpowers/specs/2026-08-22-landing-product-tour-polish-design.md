# Landing Product Tour Polish Design

**Date:** 2026-08-22  
**Status:** Approved for implementation planning

## Goal

Expand the landing page’s product proof while preserving the high-level story the
current page already tells. The result should show how Goalmaxxing supports the
full loop—planning, execution, reflection, and accountability—without turning
the landing page into a replica of the authenticated application.

This iteration also fixes the planner preview’s layout shift and sparse month
content.

## Page Architecture

The landing page will intentionally include both a high-level narrative and a
concrete product tour so they can be evaluated together after implementation.
Each section has a distinct purpose:

1. **Hero planner preview** — demonstrates planning and execution through a
   continuous Week → Month → Week loop.
2. **Existing three-scene narrative** — communicates the outcomes: plan with
   clarity, track real progress, and stay accountable.
3. **Focused product tour** — shows real product workflows: Checklist,
   Insights/history, Community, and personalization.
4. **Experimental bento** — highlights AI Coach and plan recovery in a more
   visual card layout.
5. **Why Goalmaxxing** — closes with concise product positioning rather than
   repeating the feature list.
6. **Final CTA/footer** — retains the existing conversion path.

The page may be longer during this evaluation phase. The purpose is to compare
the narrative and product-proof sections in the actual page before deciding
whether both remain.

## Hero Planner Preview

### Stable frame

Week and Month views will render inside the same fixed responsive stage. The
stage height, toolbar row, status row, and outer card dimensions will not change
between views. The selector menu will overlay the stage instead of entering
document flow.

The hero grid will use a stable alignment so changes inside the preview cannot
recenter or shift the headline and CTA column. Week and Month content may use
different internal grid layouts, but both must fit the shared stage.

### Seeded “today” treatment

The demo timeline will have one explicit seeded current day. Both views will use
the same modern treatment:

- a filled accent circle behind the date number;
- a subtle tinted day column or month cell;
- a small `Today` label where space permits.

This marks the current day inside the illustrative demo timeline; it does not
need to mirror the visitor’s operating-system date.

### Week interaction: complete a session

The Week portion will demonstrate execution instead of replanning:

1. Show the populated week with the seeded current day.
2. Open the current day’s compact preview.
3. Mark one scheduled session complete.
4. Animate the completion control and completed styling.
5. Show a short success status.
6. Open the view selector and choose Month.

This interaction must resemble the real day-preview completion flow. It must not
imply that future sessions can be completed.

### Month interaction: replan two sessions

The Month portion will demonstrate larger-scale replanning:

1. Show a populated monthly grid with readable, truncated session titles.
2. Move one incomplete past session to a future date.
3. Move one future session to the seeded current day.
4. Preserve the lifted-arc movement used by the existing demo.
5. Show draft-origin/destination states as each move settles.
6. Save both moves together once.
7. Show `Saving…` and `Saved`.
8. Open the selector and return to Week.

The past session must be incomplete because completed or credited historical
sessions cannot be moved in the real planner.

Every visible month session pill will include a short text label and color/icon
marker. No seeded session will render as a color dot without readable text.

### Motion and accessibility

The loop runs only while the hero preview is visible. It pauses when offscreen
and resumes without running multiple timers. Movement uses transform/opacity
rather than layout-changing animation.

With reduced motion enabled, the preview shows a stable populated Week state
with the current day and completed item visible; it does not automatically
cycle views or animate task movement. Status changes remain available to screen
readers through the existing live region pattern.

## Existing Three-Scene Narrative

The current scroll-driven structure, compact height, and strict
Plan → Progress → Accountability progression remain.

The section continues to describe outcomes, while the focused tour below shows
the actual product surfaces. Copy and labels will be tightened where needed so
they do not claim unsupported product behavior:

- Progress visuals use real concepts such as completion rate, activities,
  streaks, and heatmap patterns rather than invented product metrics.
- Accountability visuals use real feed events, cheers, partner nudges, or duo
  progress rather than chat or feedback-request behavior.

The section remains click-free and scroll-driven.

## Focused Product Tour

Add a new section after the three-scene narrative titled
`Built for the full loop`. It will use compact alternating product panels rather
than another full-height sticky sequence. This keeps the page scannable and
distinguishes product proof from the narrative above.

### 1. Execute your way

Show the Planner’s Checklist surface:

- Calendar / Checklist / Tasks surface selector with Checklist active;
- grouped Daily, Weekly, Monthly, and Milestone goals;
- category and progress details;
- one completed and one open goal;
- a compact `Tasks for this day` area that visually remains separate from
  recurring goals.

Safe message: users can plan visually in Calendar or work through grouped goals
in Checklist. Do not imply checklist drag-and-drop or task creation from the
Checklist surface.

### 2. See your patterns

Show real Insights concepts:

- a per-goal heatmap with a real intensity legend;
- a 30-day completion-rate trend chart;
- completion percentage and streak detail;
- an edit state on a recurring goal where a past date is toggled.

The historical editing visual must be framed accurately: users can correct past
completion details for supported recurring and milestone goals. Aggregate
heatmap drilldown is view-only, so editing must appear on a per-goal card rather
than the aggregate heatmap popup.

### 3. Progress together

Show real Community surfaces because Community is enabled in production:

- a concise feed event with a Cheer reaction;
- a seasonal leaderboard;
- a two-person duo summary with a lightweight partner nudge.

The visual must not resemble chat. Teams are two-person duos, reactions exposed
in the current UI are Cheers, and profiles require authentication.

### 4. Make it yours

Use a compact personalization strip rather than a full product panel:

- profile photo/avatar;
- timezone and week-start preference;
- Checklist-first or Calendar-first planner preference;
- reminder and social-visibility controls.

Do not imply theme controls, email/SMS notifications, or granular per-goal
privacy settings.

## Experimental Bento

Add a small two-card bento after the focused tour. This is intentionally
experimental and should not dominate the page.

### AI Coach — Beta

Show a compact, accurate coach exchange:

- user asks for help building a multi-week routine;
- coach proposes editable goal drafts or schedule changes;
- proposed changes have an explicit review/apply state.

The card may mention saved conversations, applying or undoing planner proposals,
and editable drafts. It must retain the `Beta` label and must not imply fully
autonomous planning without review.

### Recover your rhythm

Show an incomplete session left in the past being re-placed into a future open
date. Use a small before/after timeline or calendar fragment and the real
`Recover` concept.

The message is that a disrupted plan can be adjusted rather than abandoned.
Recovery reschedules uncredited sessions; it does not fabricate completions or
restore a full plan revision history.

## Why Goalmaxxing

Keep the section, but compress it into a concise emotional close. Its role is to
explain why the product exists:

- daily tools lose the long-range outcome;
- rigid plans break when real life changes;
- isolated tracking makes consistency harder.

Avoid repeating detailed feature descriptions already covered by the focused
tour. The conclusion should connect one adaptable plan, visible progress, and
optional accountability.

## Component Boundaries

- `LandingPage` remains a thin composition shell.
- `LandingPlannerPreview` owns only the Week/Month demo state machine,
  visibility pause/resume behavior, and preview rendering.
- `LandingFeatureNarrative` retains the three scroll-selected outcome scenes.
- A new focused product-tour component owns the Checklist, Insights,
  Community, and personalization panels.
- A new bento component owns the AI Coach and Recovery cards.
- Small visual fragments may be local leaf components within those files;
  shared abstractions are only introduced if both sections genuinely reuse
  them.

All data is deterministic marketing seed data. The public landing page will not
call authenticated APIs or persist demo interactions.

## Verification

Add or update focused tests for:

- the complete planner phase sequence and reduced-motion sequence;
- two independent Month moves followed by one save;
- readable text for every seeded month entry;
- consistent Week/Month stage sizing;
- current-day semantics in both views;
- deterministic feature-scene selection;
- focused-tour and bento section content;
- supported wording for historical editing and Community capabilities.

Update the landing end-to-end test to cover the new section headings and retain
the accessibility scan. Perform a browser check at desktop and mobile widths to
confirm:

- the hero headline does not move during the full loop;
- Week and Month stages do not change outer dimensions;
- month labels remain readable;
- no sticky section overlaps or creates excessive blank space;
- reduced-motion mode remains static and understandable.

## Out of Scope

- Live authenticated product embeds on the landing page.
- The future sandboxed `Try it now` experience.
- New production Planner, Insights, Community, Coach, or Recovery behavior.
- Marketing claims for goal sharing, chat, arbitrary team sizes, planner audit
  history, or other unavailable capabilities.
