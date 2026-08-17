# Live coach integration test

The live coach test verifies the real Gemini structured-output path without
starting the app or requiring an authenticated browser session. It covers:

1. coach prompt construction,
2. a live Gemini `generateContent` request,
3. candidate JSON parsing,
4. calendar-intent validation and deterministic patch compilation,
5. applying the resulting patches to a planner policy.

## Run manually

```sh
pnpm test:coach:live
```

The command loads `.env.local`, uses `GEMINI_MODEL` by default, makes exactly
one provider attempt, and disables model fallbacks to avoid unexpectedly
consuming multiple models' quotas.

To test another model for one run:

```sh
GEMINI_LIVE_TEST_MODEL=gemini-3.5-flash-lite pnpm test:coach:live
```

## Safeguards

- Normal `pnpm test` skips this test.
- CI should not set `RUN_LIVE_COACH_TESTS=true`.
- The test fails clearly if `GEMINI_API_KEY` is missing.
- The fixture contains synthetic goals and no user data.
- Provider output is not logged, avoiding accidental disclosure of generated
  content.
- The test does not write to Supabase or any application database.

This test is intentionally a provider integration test rather than a browser
E2E test. UI behavior remains covered separately; adding authentication,
Supabase state, and a development server would make a live-provider browser
test slower and substantially more brittle without improving coverage of the
structured-output/compiler failure mode.

## Manual goal-creation journey

Use the calendar surface explicitly; the default planner surface is the
checklist:

1. Open `/today?surface=calendar` and open AI Coach.
2. Ask: `Create a 5k running plan for the next four weeks.`
3. Confirm the coach renders no more than five recurring goal drafts inline
   (for example, weekly easy run and weekly long run), rather than one goal per
   workout date.
4. Edit a title, cadence, target count, date range, and default time. Confirm
   the schedule summary updates and no exact projected workout dates are
   promised before creation.
5. With unsaved calendar edits present, confirm drafts still generate but
   `Create selected goals` is disabled.
6. Clear the calendar edits and create the goals. Confirm the success message
   says creation is not undoable in the coach, then verify the checklist and
   prepared calendar refresh with the new goals.
7. Ask: `Move my first easy run to Saturday.` Confirm the coach recognizes the
   newly created goal/session instead of returning another `needs_goal`
   response.

Also exercise these failure paths:

- Exhaust or stub the bulk parser quota and confirm `quota_exceeded` or
  `rate_limited` copy appears inline with `Generate again`.
- Return six parser goals and confirm the proposal is rejected with guidance to
  simplify it to five or fewer recurring goals.
- Use a plan whose requested workload cannot fully fit in the planner window.
  Goal creation should still succeed; placement limitations should appear
  through the normal planner unplaceable-goal messaging after refresh.
