# Motion system

## Decision

Resolution uses a web-first, progressively enhanced motion system:

- CSS handles shared timing, button presses, dialog/popup entrances,
  collapsibles, and reduced-motion fallbacks.
- Motion for React handles coordinated stateful effects: the XP reward flight
  and persistent in-page panel transitions.
- React/Next.js view transitions handle route continuity. Unsupported browsers
  keep normal navigation without animation.

This keeps the common path lightweight while reserving a runtime library for
effects that need lifecycle and geometry coordination.

## Interaction contract

Completion feedback follows the canonical completion mutation:

1. The clicked control captures a plain viewport rectangle before async work.
2. A successful completion mutation dispatches `xp:refresh-requested`.
3. The XP badge fetches the canonical profile.
4. Stars fly only when the confirmed total XP increased.
5. Reversals, failed requests, duplicate facts, and non-crediting completions
   refresh the badge without a reward flight.

The overlay is mounted once by `AppShell`, renders five pointer-transparent
particles for at most 700 ms, and never owns completion or XP state.

## Accessibility and fallbacks

- `prefers-reduced-motion: reduce` disables positional route/panel motion,
  particles, completion bursts, and web haptics. XP text still updates and the
  badge may use a brief non-positional opacity highlight.
- Motion is never required to understand state. Labels, icons, toasts, and XP
  values remain the canonical feedback.
- The reward overlay is `aria-hidden` and cannot intercept pointer events.
- Buttons and completion controls keep keyboard focus rings and disabled
  semantics.
- Browser back/forward and browsers without view-transition support use normal
  instant navigation.

## Mobile and haptics

The current web haptic is an 8 ms best-effort `navigator.vibrate()` pulse.
Feature detection makes it a no-op where unsupported. Chromium-based Android
browsers generally support it; iOS Safari does not.

Reliable iOS haptics are the native-app decision gate:

- Choose Capacitor if the goal is to retain the web UI and animation code while
  adding a native haptics plugin and store packaging.
- Choose React Native/Expo only if broader native UI behavior is required.
  API contracts, domain rules, and XP event semantics remain reusable, but the
  UI should be rebuilt with Reanimated and `expo-haptics`.

No native wrapper is justified solely by the current visual effects.

## Performance budget

- Prefer `transform`, individual `translate`/`scale`, and `opacity`.
- Keep direct-manipulation feedback under 220 ms.
- Keep reward flights under 700 ms and at five particles.
- Avoid continuous animation, canvas, video, layout measurement loops, and
  per-card animation providers by default.
- Collapsible height is the only intentional layout animation; it is bounded
  to one user-opened panel.

### Journey visual exception (controlled rollout)

The mountain journey backdrop is the only approved ambient-motion exception, and
must follow strict guardrails:

- Poster-first: planner/checklist render remains usable before any media loads.
- One renderer owner per surface (web app shell, mobile tab shell); no duplicate
  player stacks.
- Reduced/still compliance from first render:
  - `prefers-reduced-motion` and explicit still mode must disable continuous
    background animation.
  - low-power mode can downgrade to reduced/still automatically.
- Lifecycle pause:
  - pause background media when app/tab is not active.
  - keep at most one active media player in steady-state.
- Failure safety:
  - invalid manifests, asset failures, and decoder failures must fall back to
    a static poster with readable UI.
- Canonical state safety:
  - journey visuals are decorative only and cannot mutate completion/XP/plan
    state.

## Verification

For motion changes, run:

- focused component tests for event gating, geometry, and reduced motion;
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`;
- Playwright Chromium, WebKit, and mobile WebKit checks when the seeded
  authenticated environment is available;
- a manual mobile pass for completion, swipe navigation, planner drag/drop,
  bottom sheets, reduced motion, and rapid repeated taps.

The expected cross-browser difference is animation fidelity, not behavior.
