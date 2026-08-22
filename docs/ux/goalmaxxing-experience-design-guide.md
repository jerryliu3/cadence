# Goalmaxxing Experience Design Guide

This guide captures the UX design language for Goalmaxxing across the public
website and authenticated application. It is meant for designers, engineers,
product owners, and AI agents extending any web surface.

The landing page is the most developed case study, but the goal is not to copy
one page. It is to reproduce the same qualities throughout the product:
focused, interactive, truthful, calm, responsive, and visually polished.

## Experience north star

**Help people turn long-range intent into adaptable daily action while always
understanding where they are, what changed, and what to do next.**

Every section should help a visitor answer one of three questions:

1. What outcome does this product help me achieve?
2. How does the product actually work?
3. Why is it meaningfully different from a to-do list or habit tracker?

The design should feel active without feeling busy. Motion should explain the
product. Product visuals should resemble real workflows. Copy should remain
short enough that the interface, not a wall of text, carries the story.

For public pages, this means making the value clear before asking for
commitment. Inside the application, it means supporting focus, momentum,
control, and recovery without hiding important state.

## Research synthesis

The original landing project included a cross-industry review of high-quality
websites, established usability guidance, accessibility standards, performance
guidance, and conversion research. The examples below are reference patterns,
not templates. Their pages evolve; the durable value is in the design decisions
they illustrate.

### What leading websites consistently do

**They make the first viewport decisive.** NN/g homepage guidance emphasizes a
clear one-sentence purpose, prominent access to the highest-priority tasks, real
examples of content, and meaningful graphics rather than decoration. Linear,
Stripe, Notion, Vercel, Slack, Apple, Airbnb, and Shopify express this in
different visual styles, but each gives the visitor a strong answer to “What is
this?” and an obvious next step.

**They use the product or service as the visual proof.** Linear builds its story
around recognizable issue, project, and agent workflows. Notion demonstrates
use cases in the workspace rather than relying on abstract productivity
imagery. Vercel pairs each infrastructure promise with a concrete customer or
product surface. Stripe moves from a concise outcome to specific solutions,
technical depth, and evidence. The transferable lesson is to show the thing
working.

**They pace information instead of presenting everything at once.** Apple often
uses one idea per visual chapter with disciplined typography and cinematic
pacing. Slack groups a broad platform into understandable benefit areas.
Stripe progressively moves from the top-level promise to solutions, proof, and
technical detail. This supports progressive disclosure: establish the mental
model first, then allow detail to accumulate.

**They keep action hierarchy unambiguous.** Strong sites use one dominant CTA
for the primary journey and quieter treatments for alternatives. Airbnb makes
the visitor’s immediate task the center of the page. Shopify repeatedly returns
to a clear starting action after explaining value for different audiences.
Repeated CTAs work when they appear after new evidence, not when they interrupt
the same message.

**They earn attention with relevance, not decoration.** Meaningful interaction
demonstrates a capability, reveals state, or helps the visitor choose. Slack,
for example, exposes explicit controls for animated content. High-quality pages
avoid making essential content depend on a carousel, hover discovery, or
continuous spectacle.

**They place evidence near claims.** Stripe and Slack support broad promises
with customer examples, measured outcomes, or technical specifics close to the
claim. A new product without verified customer evidence should not imitate this
with invented testimonials, logos, or usage metrics. Goalmaxxing uses
product-truth proof instead: faithful UI, internally consistent seeded data, and
specific supported workflows.

### Cross-industry patterns translated for Goalmaxxing

- **Linear: interface as narrative.** Let real UI states carry the explanation;
  remove chrome that does not help the current story.
- **Stripe: layer complexity.** Start with the outcome, group capabilities into
  a few understandable systems, and expose depth only after orientation.
- **Notion: demonstrate versatility through use cases.** Show different goal
  types and workflows while preserving one coherent product model.
- **Vercel: pair every assertion with proof.** Put a concrete workflow, state,
  or result beside the claim it supports.
- **Slack: make breadth scannable.** Group capabilities by user outcome rather
  than presenting a flat feature inventory; provide pause controls for
  nonessential automatic animation.
- **Apple: edit ruthlessly.** Use strong typography, purposeful space, and one
  primary idea per section. Cinematic pacing should clarify hierarchy, not
  conceal weak content.
- **Airbnb: center the immediate task.** In application surfaces, make the next
  likely action discoverable and use familiar interaction conventions.
- **Shopify: support novice and advanced intent.** Keep the default path simple
  while allowing experienced users to reach deeper capabilities efficiently.

### What creates healthy engagement

Engagement is not the number of animations, notifications, or minutes spent in
the app. For Goalmaxxing, healthy engagement means people return because the
product helps them make progress and recover when plans change.

Design for:

- **clarity:** the next meaningful action is visible;
- **competence:** progress and completion feedback make effort legible;
- **agency:** users can choose Calendar or Checklist, edit history where
  supported, control visibility, and adapt plans;
- **continuity:** today, longer-range goals, historical patterns, and future
  sessions remain connected;
- **recovery:** missed work can be understood and replanned without shame;
- **social support:** Community and Duo reinforce effort without turning the
  product into an attention-maximizing feed.

Avoid engagement dark patterns: forced urgency, guilt-heavy streak loss,
unbounded feeds, surprise notifications, hidden exits, preselected sharing, or
motion that competes with the user’s task. Optimize for successful outcomes and
trust, not raw session duration.

## Marketing page architecture: the landing case study

The landing experience uses several layers because each layer has a different
job:

1. **Hero interaction — the promise in motion.** Show the primary value
   proposition through one understandable workflow. The planner preview in
   [`landing-planner-preview.tsx`](../../src/components/landing/landing-planner-preview.tsx)
   demonstrates execution, replanning, and saving instead of presenting a
   decorative screenshot.
2. **Outcome narrative — why it matters.** Use a small number of scroll-driven
   scenes to explain outcomes such as clarity, measurable progress, and
   accountability. This is the role of
   [`landing-feature-narrative.tsx`](../../src/components/landing/landing-feature-narrative.tsx).
3. **Product tour — proof.** Show faithful versions of real product surfaces:
   Checklist, Insights, Community, and personalization. These panels answer
   “Does the product really support this?” See
   [`landing-product-tour.tsx`](../../src/components/landing/landing-product-tour.tsx).
4. **Experimental bento — secondary capabilities.** Give one or two valuable
   but non-primary features a more expressive layout. AI Coach and Recover work
   here because they enrich the core loop without replacing it.
5. **Positioning close — the reason to choose Goalmaxxing.** Return to the
   customer problem, resolve it in one concise statement, and lead into the
   final conversion action.

[`landing-page.tsx`](../../src/components/landing/landing-page.tsx) should remain
a thin composition shell. Each section owns one narrative responsibility.

## Original implementation plan, distilled

The initial project was not only a page redesign. It separated the public
website from the application and established technical conditions for a fast,
trustworthy experience.

### Public and authenticated surfaces

- `/` became a public, statically renderable marketing page.
- The authenticated product moved to canonical `/app/*` routes.
- The public page does not inspect session state or personalize its CTA. This
  preserves cacheability and avoids an authentication round trip before the
  first render.
- `/app` remains the stable product entry and honors the user’s Calendar-first
  or Checklist-first planner preference.
- Auth flows preserve the intended app destination after login.
- Web notification links, PWA launch behavior, and prefix-sensitive navigation
  were treated as part of the experience, not incidental routing details.

The broader lesson is that information architecture, rendering strategy, deep
links, and preference handling are UX. A polished page cannot compensate for a
slow first response, a lost destination after login, or inconsistent navigation
inside the app.

### Landing build sequence

The plan separated the work into reviewable layers:

1. establish canonical route and preference behavior;
2. preserve auth, deep-link, push, PWA, and stale-link journeys;
3. build the static landing shell and product visuals;
4. add metadata, accessibility, documentation, and focused regression tests.

This sequence kept the public/app cutover functional while visual work evolved.
The same delivery pattern should be used for major application redesigns:
establish navigation and state contracts first, then presentation, then focused
quality gates.

### Constraints that shaped the result

- One primary conversion action, with lower-weight alternatives.
- Product-accurate proof instead of fabricated social proof.
- Light-first design because dark tokens were not an activated product theme.
- Leaf-level Client Components; no large client-rendered marketing tree.
- Local, dimensioned hero media and reserved layout space.
- No layout-inducing animation, autoplaying audio, or carousel for primary
  content.
- Page-level zoom support, visible focus, semantic landmarks, sufficient
  contrast, and generous targets.
- Focused tests for the risky journeys rather than broad speculative
  hardening.

## Core UX principles

### 1. Lead with outcomes, then prove them

Feature inventories are difficult to remember. Begin with the transformation:
connect today’s work to goals that span weeks or months. After the visitor
understands that promise, show the exact product surfaces that support it.

Avoid saying the same thing in every section. The narrative may say “See your
patterns.” The product tour should then show a heatmap, trend chart, streak, and
historical edit state. One communicates meaning; the other supplies evidence.

### 2. Show real product behavior, not generic dashboard decoration

Marketing visuals should be simplified, but they should remain structurally
faithful to the product:

- use real surface names such as Calendar, Checklist, Tasks, Insights, and
  Community;
- preserve distinctions such as recurring goals versus one-time tasks;
- use metrics that the product actually calculates;
- show only interactions supported by the relevant surface;
- label Beta or future functionality clearly.

Seeded data should feel plausible and tell a story. “Tempo run,” “Launch
notes,” and “Weekly reset” communicate a life containing multiple kinds of
goals. A random collection of anonymous bars and dots does not.

Before designing a visual, inspect the production component, its states, and its
tests. Write down safe claims and prohibited claims. Visual polish never
justifies promising behavior the product does not have.

### 3. Use motion to explain cause and effect

Animation is valuable when it answers “What just happened?”

Good motion has an explicit sequence:

1. establish the current state;
2. focus attention;
3. perform one action;
4. show the resulting state;
5. confirm persistence or success.

For example, a session lifts, follows a visible arc, settles on another date,
and then the plan reports `Saving…` followed by `Saved`. The movement explains
replanning; the status explains persistence.

Avoid ambient motion with no informational purpose. Do not animate every card,
icon, and number merely to make the page feel active. One strong sequence is
more legible than many unrelated effects.

Use a deterministic state machine rather than loosely coordinated timers. Keep
phase names descriptive, durations centralized, and the reduced-motion state
explicit. Pause loops when offscreen and clean up every timer and observer.

### 4. Preserve spatial stability

The page should not jump while demonstrating the product. A view change inside
the hero must not move the headline, CTA, surrounding card, or page below it.

Use these patterns:

- give alternate views one shared fixed or minimum stage;
- reserve space for the largest expected state;
- position dropdowns, moving pills, and transient overlays outside normal
  document flow;
- animate with transforms rather than changing layout properties;
- keep status and toolbar rows the same height across phases.

Stable geometry is both a polish requirement and a Core Web Vitals concern.
Measure it rather than relying on visual intuition.

### 5. Make the page interactive without making it demanding

Visitors should understand the story by scrolling normally. Core explanations
must not require discovering a hidden tab or repeatedly clicking tiny controls.

On desktop, a sticky visual can change as nearby narrative cards cross a
viewport anchor. Keep the order deterministic and limit scenes to a sequence a
visitor can retain. On mobile, recompose: pair each narrative card with its own
visual instead of placing all copy above one non-sticky visual.

Use click interactions for optional exploration, not for understanding the
primary value proposition.

### 6. Control information density through hierarchy

The visual language is calm because it has strong hierarchy, not because it
avoids detail.

- Use one dominant heading per section.
- Keep explanatory copy to one short paragraph.
- Group detailed UI inside bordered cards with clear internal headers.
- Use compact labels for metadata and state.
- Give primary actions strong contrast and secondary actions an outline or
  quieter treatment.
- Reserve saturated color for actions, current state, success, or meaningful
  categorization.

Nested cards are useful when they mirror the product’s information structure,
but avoid stacking borders purely for decoration. Whitespace should separate
ideas; it should not create unexplained empty regions.

### 7. Use color semantically and redundantly

Color should carry consistent meaning:

- blue for primary action, selection, and current focus;
- emerald for completion and healthy progress;
- violet for long-range or community-oriented accents;
- amber/orange for attention, adaptation, or recovery;
- neutral tones for structure and inactive state.

Never rely on color alone. A current date also receives `Today` semantics. A
completed item has a checkmark and changed text treatment. A moved item has
origin/destination styling and status copy.

Check contrast during transitions, not only at rest. Fading an entire container
can temporarily blend all descendant text into the background. Prefer
transform-only movement for text-bearing surfaces when opacity would weaken
contrast.

### 8. Recompose for mobile; do not merely shrink

Mobile design has different spatial relationships:

- interleave narrative and visual content;
- ensure small calendar cells reserve room for every visible label;
- truncate gracefully while retaining a readable title and programmatic label;
- stack bento cards according to narrative priority;
- preserve comfortable touch targets for real controls;
- avoid sticky behavior that leaves the active content offscreen.

Test intermediate states, not only the initial viewport. Animated content often
overflows only after a move, menu opening, or status change.

### 9. Build accessibility into the visual concept

Accessibility is a design input, not a cleanup pass:

- provide a stable, useful reduced-motion state instead of merely shortening
  durations;
- expose status changes through an appropriate live region;
- mark the current date programmatically;
- maintain readable type sizes inside dense mockups;
- preserve logical heading order and semantic section structure;
- keep meaningful information available without hover;
- run contrast checks while the page is in a deterministic state.

Illustrative controls that are intentionally non-interactive should not pretend
to be working form controls. Real controls need keyboard behavior, focus
indicators, and accessible names.

### 10. Experiment at the edges, not at the center

Use the bento area to test a new visual treatment or spotlight a secondary
capability. Keep the hero and main product story consistent so experimentation
does not weaken comprehension or conversion.

An experimental card still follows product truth. AI Coach shows a proposal and
review state rather than implying unreviewed autonomy. Recover shows unfinished
sessions being rescheduled rather than inventing completed work.

## Application-wide interaction principles

The marketing principles above also apply inside the authenticated product, but
an application has an additional obligation: help users act repeatedly,
correctly, and confidently.

### Keep system status visible

Every consequential action should produce immediate, proportionate feedback.
Show selected dates, active surfaces, draft movement, saving, success, and
failure. Preserve state long enough to be understood. A checkmark that appears
for one frame is not feedback; a permanent spinner is not transparency.

Use optimistic updates only when failure can be reconciled clearly. For
multi-step or destructive work, distinguish draft state from persisted state.
The landing planner’s lift → move → settle → save sequence is a simplified
example of the same principle the application should follow.

### Preserve user control and recovery

Prefer reversible actions, explicit Cancel paths, and understandable recovery.
When undo is practical, offer it. When it is not, explain the consequence before
commitment. Do not trap people in a modal, wizard, filtered view, or animation.

Goalmaxxing should treat replanning as a normal workflow, not an error state.
Missed sessions, historical corrections, and preference changes should preserve
the user’s mental model and communicate what will change.

### Favor recognition over recall

Keep context near the action:

- show the active day and surface;
- retain labels beside icons where ambiguity is likely;
- display goal category, cadence, and progress where decisions depend on them;
- use visible defaults instead of relying on remembered settings;
- provide contextual help at the point of friction.

Users should not need to remember which view owns an action or what a color
means on another screen.

### Use progressive disclosure

The default interface should support the most common task without exposing
every option. Secondary details can live in sheets, dialogs, expandable areas,
or focused detail pages. Advanced users should still have efficient paths.

Progressive disclosure is not hiding. The trigger must be visible, labeled, and
located where users expect it. Do not bury frequent actions to make a screenshot
look cleaner.

### Maintain continuity across time

Time is Goalmaxxing’s core information architecture. Daily actions, weekly
cadence, monthly outcomes, historical patterns, and long-range goals must feel
like views of one system.

Use consistent goal names, colors, completion language, and date semantics
across Planner, Checklist, Insights, and Community. Preserve the current date
and selected date distinctly. When changing granularity, keep enough context
that users understand where their work went.

### Support flexibility without fragmentation

Calendar-first and Checklist-first are different working styles, not separate
products. Preferences should change the entry point or presentation while
preserving the same underlying concepts and state.

Reuse interaction patterns and terminology across surfaces. Introduce a new
pattern only when the task genuinely differs. Consistency reduces cognitive
load; flexibility lets users work efficiently.

### Design performance as interaction quality

Use the Core Web Vitals quality targets established in the original plan:

- LCP at or below 2.5 seconds;
- INP at or below 200 milliseconds;
- CLS at or below 0.1;

evaluated at the 75th percentile for real users where field data is available.
These are experience thresholds, not score-chasing goals.

Render useful structure early, reserve geometry before data arrives, and avoid
blocking the entire surface on information that can load incrementally. A
skeleton should match the final layout and indicate progress; it should not
replace already-known labels or persist indefinitely. Keep expensive client
logic close to the interaction that requires it.

### Make responsive behavior task-aware

Responsive application design is not a sequence of smaller screenshots.
Prioritize the current task at each width:

- convert dense side-by-side regions into a clear sequence;
- keep critical actions reachable without obscuring content;
- preserve selected and current context when controls move;
- provide a non-drag alternative for drag interactions;
- avoid desktop sticky regions that trap mobile focus or consume the viewport.

Test zoom, orientation changes, long labels, software keyboards, and actual
intermediate interaction states.

### Build accessible defaults

Apply WCAG 2.2 requirements to the design itself:

- do not obscure focused elements behind sticky UI;
- meet minimum target size or spacing;
- provide simple-pointer alternatives to dragging;
- support password managers and paste in authentication;
- avoid redundant data entry;
- keep help in a consistent location;
- honor reduced motion and offer control over nonessential auto-animation.

Accessibility improvements usually strengthen the product for everyone:
visible state, larger targets, predictable navigation, recovery options, and
plain language all reduce friction.

## Implementation playbook

### Before designing

1. Identify the user, their current context, and the one primary task.
2. Define the expected result, feedback, failure, cancel, and recovery states.
3. Inspect related product surfaces, domain rules, preferences, and tests.
4. Decide which information must remain visible and which can be progressively
   disclosed.
5. For public demonstrations, list safe claims and choose one seeded story with
   an obvious beginning and result.
6. Decide what can remain server-rendered and what truly requires browser
   state.

### While building

- Keep static tours and bento visuals as Server Components.
- Isolate `IntersectionObserver`, timers, measurements, and motion in the
  smallest practical Client Component.
- Use deterministic arrays for scenes and animation phases.
- Keep seed data next to the visual that owns it.
- Add data attributes only where they support meaningful behavioral or layout
  tests.
- Reuse the product’s visual vocabulary without importing large authenticated
  surfaces into the public page.
- In application workflows, preserve one source of truth for state and keep
  draft, optimistic, persisted, and failed states visually distinct.
- Use existing navigation, dialog, form, feedback, and responsive patterns
  before introducing a new interaction language.

### Good and bad patterns

**Good copy:** “Correct a forgotten past completion for supported recurring
goals.”

**Bad copy:** “Edit anything in your history.” It is shorter, but inaccurate.

**Good motion:** session lifts → moves → settles → one save confirmation.

**Bad motion:** several cards pulse continuously while numbers count upward
without relation to a user action.

**Good responsive behavior:** desktop sticky narrative becomes card-plus-visual
pairs on mobile.

**Bad responsive behavior:** desktop columns collapse into a long list where
all visuals appear after all explanations.

**Good application feedback:** a moved session visibly enters draft state,
Save communicates progress, and success confirms the persisted result.

**Bad application feedback:** a session moves immediately with no indication
of whether the change is local, saving, saved, or recoverable.

## Review checklist

### Product and narrative

- Does every section have one distinct job?
- Is the primary benefit visible before the feature inventory?
- Does every marketing claim map to shipped or clearly labeled Beta behavior?
- Are illustrative values internally consistent?
- Is any message repeated without adding proof or meaning?

### Application workflow

- Is the user’s current location, date, selection, and active surface clear?
- Is the primary action visually stronger than secondary actions?
- Does every consequential action expose timely system feedback?
- Are draft, persisted, success, and failure states distinguishable?
- Can users cancel, undo, or recover in proportion to the consequence?
- Does the workflow favor recognition over remembered instructions?
- Are terminology and state consistent across Planner, Checklist, Insights, and
  Community?
- Do preferences improve efficiency without fragmenting core behavior?

### Motion and layout

- Does each animation explain a product action?
- Is the sequence deterministic and understandable without narration?
- Do all loops pause offscreen?
- Does reduced motion produce a complete static story?
- Do alternate states preserve stage, headline, CTA, and page geometry?
- Are dropdowns and moving elements prevented from shifting layout?

### Responsive and accessible behavior

- Is each mobile explanation adjacent to its visual?
- Do labels remain within cards and calendar cells after every animated state?
- Is current/selected/completed state communicated without color alone?
- Does text retain contrast during transitions?
- Are live updates, headings, and current-date semantics exposed correctly?
- Can the core story be understood without clicking or hovering?

### Verification

- Unit-test phase order and seed invariants.
- Component-test required content and accurate claims.
- Browser-test the rendered action sequence and save result.
- Measure stable dimensions across alternate views.
- Check mobile bounds after the final animated state.
- Run accessibility checks under reduced motion.
- Review screenshots at desktop and mobile widths.

## Prompt for future AI agents

Use the following when extending this design language:

> Design this Goalmaxxing web experience outcome-first. Identify the user’s
> current context, primary task, expected feedback, and recovery path. Inspect
> the real product before making claims or introducing new interaction
> patterns. Prefer visible state, recognition over recall, progressive
> disclosure, stable geometry, and responsive recomposition. Use motion only to
> explain cause and effect, and provide a complete reduced-motion state. Keep
> static sections server-rendered and isolate browser state in focused client
> components. Verify task clarity, product truthfulness, continuity across
> surfaces, mobile behavior, transient contrast, performance, and accessibility
> before handoff. Follow
> `docs/ux/goalmaxxing-experience-design-guide.md`.

## Research references

- [NN/g: Top 10 Guidelines for Homepage Usability](https://www.nngroup.com/articles/top-ten-guidelines-for-homepage-usability/)
- [NN/g: 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [web.dev: Core Web Vitals](https://web.dev/articles/top-cwv)
- [web.dev: Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp)
- [W3C: What’s New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [Unbounce Conversion Benchmark Report](https://unbounce.com/conversion-benchmark-report/)
- Live reference sites reviewed:
  [Linear](https://linear.app/), [Stripe](https://stripe.com/),
  [Notion](https://www.notion.com/), [Vercel](https://vercel.com/),
  [Slack](https://slack.com/), [Apple](https://www.apple.com/),
  [Airbnb](https://www.airbnb.com/), and
  [Shopify](https://www.shopify.com/).

