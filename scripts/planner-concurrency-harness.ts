import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;

const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const statementTimeoutMs = 10_000;
const observationTimeoutMs = 5_000;
const ownerId = "11111111-1111-4111-8111-111111111111";
const quotaOwnerId = "22222222-2222-4222-8222-222222222222";
const raceOwnerId = "44444444-4444-4444-8444-444444444444";
const raceGoalId = "44000000-0000-4000-8000-000000000001";
const xpRaceOwnerId = "55555555-5555-4555-8555-555555555555";
const xpRaceGoalId = "55000000-0000-4000-8000-000000000001";
const xpSocialSourceKey = "xp-concurrency-social-award";
const teamRacePrimaryId = "66666666-6666-4666-8666-666666666666";
const teamRacePartnerBId = "77777777-7777-4777-8777-777777777777";
const teamRacePartnerCId = "88888888-8888-4888-8888-888888888888";
const teamRaceTeamOneId = "66000000-0000-4000-8000-000000000001";
const teamRaceTeamTwoId = "66000000-0000-4000-8000-000000000002";

class NamedBarriers {
  private readonly barriers = new Map<
    string,
    { promise: Promise<void>; resolve: () => void; signaled: boolean }
  >();

  constructor(names: string[]) {
    for (const name of names) {
      let resolve!: () => void;
      const promise = new Promise<void>((barrierResolve) => {
        resolve = barrierResolve;
      });
      this.barriers.set(name, { promise, resolve, signaled: false });
    }
  }

  wait(name: string) {
    const barrier = this.barriers.get(name);
    if (!barrier) {
      throw new Error(`Unknown concurrency barrier: ${name}`);
    }
    return barrier.promise;
  }

  signal(name: string) {
    const barrier = this.barriers.get(name);
    if (!barrier) {
      throw new Error(`Unknown concurrency barrier: ${name}`);
    }
    if (barrier.signaled) {
      throw new Error(`Concurrency barrier signaled twice: ${name}`);
    }
    barrier.signaled = true;
    barrier.resolve();
  }
}

async function configureSession(client: pg.Client, applicationName: string) {
  await client.query("select set_config('application_name', $1, false)", [
    applicationName,
  ]);
  await client.query("select set_config('statement_timeout', $1, false)", [
    `${statementTimeoutMs}ms`,
  ]);
  await client.query(
    "select set_config('idle_in_transaction_session_timeout', $1, false)",
    [`${statementTimeoutMs}ms`]
  );
}

async function waitForAdvisoryBlock(control: pg.Client, blockedPid: number) {
  const deadline = performance.now() + observationTimeoutMs;

  while (performance.now() < deadline) {
    const result = await control.query<{
      wait_event_type: string | null;
      wait_event: string | null;
    }>(
      `select wait_event_type, wait_event
       from pg_catalog.pg_stat_activity
       where pid = $1`,
      [blockedPid]
    );
    const activity = result.rows[0];

    if (
      activity?.wait_event_type === "Lock" &&
      activity.wait_event === "advisory"
    ) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `Session ${blockedPid} did not reach the named advisory barrier within ${observationTimeoutMs}ms.`
  );
}

async function rollbackIfNeeded(client: pg.Client) {
  try {
    await client.query("rollback");
  } catch {
    // The client may already be outside a transaction or disconnected.
  }
}

async function main() {
  const sessionA = new Client({ connectionString: databaseUrl });
  const sessionB = new Client({ connectionString: databaseUrl });
  const control = new Client({ connectionString: databaseUrl });
  const barriers = new NamedBarriers([
    "session-a-holds-owner-lock",
    "session-b-requested-owner-lock",
    "release-session-a",
  ]);
  const observedOrder: string[] = [];
  const xpObservedOrder: string[] = [];
  const teamObservedOrder: string[] = [];

  await Promise.all([sessionA.connect(), sessionB.connect(), control.connect()]);

  try {
    await Promise.all([
      configureSession(sessionA, "planner-concurrency-session-a"),
      configureSession(sessionB, "planner-concurrency-session-b"),
      configureSession(control, "planner-concurrency-control"),
    ]);

    const sessionBPidResult = await sessionB.query<{ pid: number }>(
      "select pg_backend_pid() as pid"
    );
    const sessionBPid = sessionBPidResult.rows[0]?.pid;
    assert.ok(sessionBPid, "Session B must expose a PostgreSQL backend pid.");

    const sessionATask = (async () => {
      await sessionA.query("begin");
      await sessionA.query(
        "select pg_advisory_xact_lock(private.planner_owner_lock_key($1::uuid))",
        [ownerId]
      );
      observedOrder.push("session-a-acquired");
      barriers.signal("session-a-holds-owner-lock");
      await barriers.wait("release-session-a");
      await sessionA.query("commit");
      observedOrder.push("session-a-committed");
    })();

    const sessionBTask = (async () => {
      await barriers.wait("session-a-holds-owner-lock");
      await sessionB.query("begin");
      barriers.signal("session-b-requested-owner-lock");
      await sessionB.query(
        "select pg_advisory_xact_lock(private.planner_owner_lock_key($1::uuid))",
        [ownerId]
      );
      observedOrder.push("session-b-acquired");
      await sessionB.query("commit");
      observedOrder.push("session-b-committed");
    })();

    await barriers.wait("session-b-requested-owner-lock");
    await waitForAdvisoryBlock(control, sessionBPid);
    observedOrder.push("session-b-observed-blocked");
    barriers.signal("release-session-a");

    await Promise.all([sessionATask, sessionBTask]);

    assert.equal(new Set(observedOrder).size, 5);
    assert.equal(observedOrder[0], "session-a-acquired");
    assert.equal(observedOrder[1], "session-b-observed-blocked");
    assert.ok(
      observedOrder.indexOf("session-a-committed") >
        observedOrder.indexOf("session-b-observed-blocked")
    );
    assert.ok(
      observedOrder.indexOf("session-b-acquired") >
        observedOrder.indexOf("session-b-observed-blocked")
    );
    assert.ok(
      observedOrder.indexOf("session-b-committed") >
        observedOrder.indexOf("session-a-committed")
    );
    assert.ok(
      observedOrder.indexOf("session-b-committed") >
        observedOrder.indexOf("session-b-acquired")
    );

    await control.query(
      `delete from public.planner_ai_usage_daily
       where owner_id = $1
         and usage_date = (clock_timestamp() at time zone 'UTC')::date
         and feature = 'planner_coach'`,
      [quotaOwnerId]
    );
    const quotaAttempts = await Promise.all(
      [sessionA, sessionB].map((session) =>
        session.query<{ allowed: boolean; request_count: number }>(
          `select allowed, request_count
           from public.consume_planner_ai_quota(
             $1::uuid,
             'planner_coach',
             1,
             0
           )`,
          [quotaOwnerId]
        )
      )
    );
    assert.deepEqual(
      quotaAttempts
        .map((result) => result.rows[0]?.allowed)
        .sort(),
      [false, true],
      "Exactly one concurrent attempt should consume the last quota slot."
    );
    assert.equal(
      quotaAttempts.find((result) => result.rows[0]?.allowed)?.rows[0]
        ?.request_count,
      1
    );
    await control.query(
      `delete from public.planner_ai_usage_daily
       where owner_id = $1
         and usage_date = (clock_timestamp() at time zone 'UTC')::date
         and feature = 'planner_coach'`,
      [quotaOwnerId]
    );

    await control.query("delete from auth.users where id = $1", [
      raceOwnerId,
    ]);
    await control.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change_token_current,
         reauthentication_token, email_change, raw_app_meta_data,
         raw_user_meta_data, created_at, updated_at
       )
       values (
         $1, '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', 'planner-race@example.test', '',
         now(), '', '', '', '', '', '', '{"provider":"email"}',
         '{"username":"planner_race"}', now(), now()
       )`,
      [raceOwnerId]
    );
    await control.query(
      `insert into public.goals (
         id, owner_id, title, category, frequency_type,
         recurrence_interval, target_count, start_date, end_date, is_group
       )
       values (
         $1,
         $2,
         'Race schedule goal',
         'test',
         'recurring',
         'weekly',
         1,
         date_trunc('month', current_date)::date,
         (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
         false
       )`,
      [raceGoalId, raceOwnerId]
    );
    await control.query("delete from public.planner_items where owner_id = $1", [
      raceOwnerId,
    ]);

    const scopeResult = await control.query<{
      scope_month: string;
      scheduled_day_a: string;
      scheduled_day_b: string;
    }>(
      `select
         date_trunc('month', current_date)::date::text as scope_month,
         (date_trunc('month', current_date)::date + 3)::text as scheduled_day_a,
         (date_trunc('month', current_date)::date + 5)::text as scheduled_day_b`
    );
    const scopeMonth = scopeResult.rows[0]?.scope_month;
    const scheduledDayA = scopeResult.rows[0]?.scheduled_day_a;
    const scheduledDayB = scopeResult.rows[0]?.scheduled_day_b;
    assert.ok(scopeMonth, "Race scope month must be available.");
    assert.ok(
      scheduledDayA && scheduledDayB,
      "Race scheduled days must be available."
    );

    await control.query("select set_config('request.jwt.claim.sub', $1, false)", [
      raceOwnerId,
    ]);
    await control.query(
      "select set_config('request.jwt.claim.role', 'authenticated', false)"
    );
    const digestResult = await control.query<{ digest: string }>(
      "select public.get_planner_schedule_digest($1::uuid) as digest",
      [raceOwnerId]
    );
    const initialDigest = digestResult.rows[0]?.digest ?? "";
    assert.ok(
      initialDigest.length > 0,
      "Initial planner schedule digest must be non-empty."
    );

    const payloadA = [
      {
        goal_id: raceGoalId,
        unit_key: "total:1",
        scheduled_date: scheduledDayA,
        original_scheduled_date: scheduledDayA,
        locked: false,
      },
    ];
    const payloadB = [
      {
        goal_id: raceGoalId,
        unit_key: "total:1",
        scheduled_date: scheduledDayB,
        original_scheduled_date: scheduledDayB,
        locked: false,
      },
    ];

    const raceBarriers = new NamedBarriers([
      "schedule-a-updated",
      "link-requested-owner-lock",
      "commit-schedule-a",
    ]);
    let staleScheduleErrorCode: string | undefined;
    let staleScheduleErrorMessage: string | undefined;
    const scheduleTaskA = (async () => {
      await sessionA.query("begin");
      await sessionA.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [raceOwnerId]
      );
      await sessionA.query(
        `select schedule_digest, upserted_count
         from public.set_planner_schedule($1::date, $2::jsonb, $3::text)`,
        [scopeMonth, JSON.stringify(payloadA), initialDigest]
      );
      raceBarriers.signal("schedule-a-updated");
      await raceBarriers.wait("commit-schedule-a");
      await sessionA.query("commit");
    })();
    const scheduleTaskB = (async () => {
      await raceBarriers.wait("schedule-a-updated");
      await sessionB.query("begin");
      await sessionB.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [raceOwnerId]
      );
      raceBarriers.signal("link-requested-owner-lock");
      try {
        await sessionB.query(
          `select schedule_digest, upserted_count
           from public.set_planner_schedule($1::date, $2::jsonb, $3::text)`,
          [scopeMonth, JSON.stringify(payloadB), initialDigest]
        );
        await sessionB.query("commit");
      } catch (error) {
        staleScheduleErrorCode =
          error instanceof pg.DatabaseError ? error.code : undefined;
        staleScheduleErrorMessage =
          error instanceof pg.DatabaseError ? error.message : undefined;
        await sessionB.query("rollback");
      }
    })();

    await raceBarriers.wait("link-requested-owner-lock");
    await waitForAdvisoryBlock(control, sessionBPid);
    raceBarriers.signal("commit-schedule-a");
    await Promise.all([scheduleTaskA, scheduleTaskB]);
    assert.equal(
      staleScheduleErrorCode,
      "P0001",
      "A stale schedule writer blocked behind owner lock must fail."
    );
    assert.equal(
      staleScheduleErrorMessage,
      "stale_schedule",
      "Blocked concurrent writer should receive stale_schedule."
    );
    const persistedItems = await control.query<{
      unit_key: string;
      scheduled_date: string;
    }>(
      `select unit_key, scheduled_date::text as scheduled_date
       from public.planner_items
       where owner_id = $1
         and goal_id = $2
       order by unit_key`,
      [raceOwnerId, raceGoalId]
    );
    assert.deepEqual(
      persistedItems.rows.map((row) => `${row.unit_key}@${row.scheduled_date}`),
      [`total:1@${scheduledDayA}`],
      "Committed payload should survive stale concurrent writer."
    );

    await control.query("delete from auth.users where id = $1", [
      raceOwnerId,
    ]);

    await control.query("delete from public.goals where owner_id = $1", [xpRaceOwnerId]);
    await control.query("delete from public.user_awards where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.xp_ledger where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.xp_profiles where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.profiles where id = $1", [xpRaceOwnerId]);
    await control.query("delete from auth.users where id = $1", [xpRaceOwnerId]);
    await control.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change_token_current,
         reauthentication_token, email_change, raw_app_meta_data,
         raw_user_meta_data, created_at, updated_at
       )
       values (
         $1, '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', 'planner-xp-race@example.test', '',
         now(), '', '', '', '', '', '', '{"provider":"email"}',
         '{"username":"planner_xp_race"}', now(), now()
       )`,
      [xpRaceOwnerId]
    );
    await control.query(
      `insert into public.profiles (id, username, timezone)
       values ($1, 'planner_xp_race', 'America/New_York')
       on conflict (id) do update
       set timezone = excluded.timezone`,
      [xpRaceOwnerId]
    );
    await control.query(
      `insert into public.goals (
         id, owner_id, title, category, frequency_type,
         recurrence_interval, target_count, start_date, end_date, is_group
       )
       values (
         $1,
         $2,
         'XP race goal',
         'Health',
         'recurring',
         'weekly',
         1,
         current_date - 14,
         current_date + 14,
         false
       )`,
      [xpRaceGoalId, xpRaceOwnerId]
    );
    await control.query(
      `insert into public.completions (goal_id, user_id, completed_on, source)
       values ($1, $2, (now() at time zone 'America/New_York')::date, 'manual')`,
      [xpRaceGoalId, xpRaceOwnerId]
    );
    await control.query("delete from public.user_awards where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.xp_ledger where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.xp_profiles where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query(
      `insert into public.xp_profiles (user_id, track_key, total_xp, current_level)
       values ($1, 'global', 0, private.xp_level_for_total(0))
       on conflict (user_id, track_key) do update
       set total_xp = excluded.total_xp,
           current_level = excluded.current_level`,
      [xpRaceOwnerId]
    );

    const xpRaceBarriers = new NamedBarriers([
      "xp-session-a-refresh-complete",
      "xp-session-b-requested-social-award",
      "xp-release-session-a",
    ]);
    let xpSocialSeq: number | null = null;
    const xpSessionATask = (async () => {
      await sessionA.query("begin");
      await sessionA.query(
        "select public.recompute_goal_xp_service($1::uuid, $2::uuid, false)",
        [xpRaceOwnerId, xpRaceGoalId]
      );
      xpObservedOrder.push("xp-session-a-recompute");
      xpRaceBarriers.signal("xp-session-a-refresh-complete");
      await xpRaceBarriers.wait("xp-release-session-a");
      await sessionA.query("commit");
      xpObservedOrder.push("xp-session-a-committed");
    })();
    const xpSessionBTask = (async () => {
      await xpRaceBarriers.wait("xp-session-a-refresh-complete");
      await sessionB.query("begin");
      const socialAwardQuery = sessionB.query<{ seq: number | null }>(
        `select public.award_social_xp_service(
           $1::uuid,
           'challenge_award',
           $2::text,
           15
         ) as seq`,
        [xpRaceOwnerId, xpSocialSourceKey]
      );
      xpRaceBarriers.signal("xp-session-b-requested-social-award");
      const socialAwardResult = await socialAwardQuery;
      xpSocialSeq = socialAwardResult.rows[0]?.seq ?? null;
      xpObservedOrder.push("xp-session-b-social-award");
      await sessionB.query("commit");
      xpObservedOrder.push("xp-session-b-committed");
    })();

    await xpRaceBarriers.wait("xp-session-b-requested-social-award");
    await waitForAdvisoryBlock(control, sessionBPid);
    xpObservedOrder.push("xp-session-b-observed-blocked");
    xpRaceBarriers.signal("xp-release-session-a");
    await Promise.all([xpSessionATask, xpSessionBTask]);

    assert.ok(
      xpSocialSeq !== null,
      "Concurrent social award should insert a social ledger row."
    );
    assert.equal(new Set(xpObservedOrder).size, 5);
    assert.equal(xpObservedOrder[0], "xp-session-a-recompute");
    assert.equal(xpObservedOrder[1], "xp-session-b-observed-blocked");
    assert.ok(
      xpObservedOrder.indexOf("xp-session-b-social-award") >
        xpObservedOrder.indexOf("xp-session-b-observed-blocked")
    );

    const xpTotals = await control.query<{
      ledger_total: number;
      profile_total: number;
    }>(
      `select
         coalesce((
           select sum(xp_delta)::integer
           from public.xp_ledger
           where user_id = $1
         ), 0) as ledger_total,
         coalesce((
           select total_xp
           from public.xp_profiles
           where user_id = $1
             and track_key = 'global'
         ), 0) as profile_total`,
      [xpRaceOwnerId]
    );
    const xpTotalsRow = xpTotals.rows[0];
    assert.ok(xpTotalsRow, "XP totals row should exist.");
    assert.equal(
      xpTotalsRow.profile_total,
      xpTotalsRow.ledger_total,
      "XP profile total should always equal the global ledger sum after concurrent writes."
    );
    const xpSocialRows = await control.query<{ rows: number }>(
      `select count(*)::integer as rows
       from public.xp_ledger
       where user_id = $1
         and event_type = 'challenge_award'
         and source_key = $2
         and track_key = 'global'
         and xp_delta = 15`,
      [xpRaceOwnerId, xpSocialSourceKey]
    );
    assert.equal(
      xpSocialRows.rows[0]?.rows,
      1,
      "Concurrent run should include exactly one social-award global ledger row."
    );

    await control.query("delete from public.goals where id = $1", [xpRaceGoalId]);
    await control.query("delete from public.user_awards where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.xp_ledger where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.xp_profiles where user_id = $1", [
      xpRaceOwnerId,
    ]);
    await control.query("delete from public.profiles where id = $1", [xpRaceOwnerId]);

    await control.query(
      "delete from public.teams where id in ($1::uuid, $2::uuid)",
      [teamRaceTeamOneId, teamRaceTeamTwoId]
    );
    await control.query(
      "delete from public.profiles where id = any($1::uuid[])",
      [[teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]]
    );
    await control.query(
      "delete from auth.users where id = any($1::uuid[])",
      [[teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]]
    );
    await control.query(
      `insert into auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change_token_current,
         reauthentication_token, email_change, raw_app_meta_data,
         raw_user_meta_data, created_at, updated_at
       )
       values
       ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'team-race-a@example.test', '', now(), '', '', '', '', '', '', '{"provider":"email"}', '{"username":"team_race_a"}', now(), now()),
       ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'team-race-b@example.test', '', now(), '', '', '', '', '', '', '{"provider":"email"}', '{"username":"team_race_b"}', now(), now()),
       ($3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'team-race-c@example.test', '', now(), '', '', '', '', '', '', '{"provider":"email"}', '{"username":"team_race_c"}', now(), now())`,
      [teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]
    );
    await control.query(
      `insert into public.profiles (id, username, timezone)
       values
       ($1, 'team_race_a', 'UTC'),
       ($2, 'team_race_b', 'UTC'),
       ($3, 'team_race_c', 'UTC')
       on conflict (id) do update
       set timezone = excluded.timezone`,
      [teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]
    );
    await control.query(
      `insert into public.teams (
         id, initiator_id, status, invited_at
       )
       values
       ($1, $3, 'pending', now() - interval '2 minutes'),
       ($4, $5, 'pending', now() - interval '1 minute')`,
      [
        teamRaceTeamOneId,
        teamRacePrimaryId,
        teamRacePartnerBId,
        teamRaceTeamTwoId,
        teamRacePartnerCId,
      ]
    );
    await control.query(
      `insert into public.team_members (team_id, user_id, role)
       values
       ($1, $2, 'member'),
       ($1, $3, 'initiator'),
       ($4, $2, 'member'),
       ($4, $5, 'initiator')`,
      [
        teamRaceTeamOneId,
        teamRacePrimaryId,
        teamRacePartnerBId,
        teamRaceTeamTwoId,
        teamRacePartnerCId,
      ]
    );

    const teamBarriers = new NamedBarriers([
      "team-session-a-accepted",
      "team-session-b-requested-lock",
      "team-release-session-a",
    ]);
    let teamSecondAcceptErrorCode: string | undefined;
    let teamSecondAcceptErrorMessage: string | undefined;
    let teamSecondAcceptAccepted: boolean | undefined;
    const teamSessionATask = (async () => {
      await sessionA.query("begin");
      await sessionA.query("select set_config('request.jwt.claim.sub', $1, true)", [
        teamRacePrimaryId,
      ]);
      await sessionA.query(
        "select set_config('request.jwt.claim.role', 'authenticated', true)"
      );
      await sessionA.query(
        "select public.accept_team_invite_service($1::uuid, true) as accepted",
        [teamRaceTeamOneId]
      );
      teamObservedOrder.push("team-session-a-accepted");
      teamBarriers.signal("team-session-a-accepted");
      await teamBarriers.wait("team-release-session-a");
      await sessionA.query("commit");
      teamObservedOrder.push("team-session-a-committed");
    })();
    const teamSessionBTask = (async () => {
      await teamBarriers.wait("team-session-a-accepted");
      await sessionB.query("begin");
      await sessionB.query("select set_config('request.jwt.claim.sub', $1, true)", [
        teamRacePrimaryId,
      ]);
      await sessionB.query(
        "select set_config('request.jwt.claim.role', 'authenticated', true)"
      );
      const acceptPromise = sessionB.query(
        "select public.accept_team_invite_service($1::uuid, true) as accepted",
        [teamRaceTeamTwoId]
      );
      teamBarriers.signal("team-session-b-requested-lock");
      try {
        const acceptResult = await acceptPromise;
        teamSecondAcceptAccepted = Boolean(
          (acceptResult.rows[0] as { accepted?: boolean } | undefined)?.accepted
        );
        await sessionB.query("commit");
        teamObservedOrder.push("team-session-b-committed");
      } catch (error) {
        teamSecondAcceptErrorCode =
          error instanceof pg.DatabaseError ? error.code : undefined;
        teamSecondAcceptErrorMessage =
          error instanceof pg.DatabaseError ? error.message : undefined;
        teamObservedOrder.push("team-session-b-failed");
        await sessionB.query("rollback");
      }
    })();

    await teamBarriers.wait("team-session-b-requested-lock");
    await waitForAdvisoryBlock(control, sessionBPid);
    teamObservedOrder.push("team-session-b-observed-blocked");
    teamBarriers.signal("team-release-session-a");
    await Promise.all([teamSessionATask, teamSessionBTask]);

    // accept_team_invite_service serializes on per-user advisory locks and then
    // re-checks the single-active invariant, rejecting the loser by returning
    // false rather than raising. Assert the outcome, not the mechanism, so this
    // holds whether the invariant is enforced in the RPC or by a constraint.
    const teamSecondAcceptRejected =
      teamSecondAcceptAccepted === false || teamSecondAcceptErrorCode !== undefined;
    assert.equal(
      teamSecondAcceptRejected,
      true,
      `Second concurrent team accept should be rejected (accepted=${String(
        teamSecondAcceptAccepted
      )}, errorCode=${String(teamSecondAcceptErrorCode)}, errorMessage=${String(
        teamSecondAcceptErrorMessage
      )}).`
    );
    const activeTeamCount = await control.query<{ count: number }>(
      `select count(*)::integer as count
       from public.teams team
       join public.team_members member on member.team_id = team.id
       where team.status = 'active'
         and member.user_id = $1`,
      [teamRacePrimaryId]
    );
    assert.equal(
      activeTeamCount.rows[0]?.count,
      1,
      "Exactly one active team should exist for the shared user after concurrent accepts."
    );

    await control.query(
      "delete from public.teams where id in ($1::uuid, $2::uuid)",
      [teamRaceTeamOneId, teamRaceTeamTwoId]
    );
    await control.query(
      "delete from public.profiles where id = any($1::uuid[])",
      [[teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]]
    );
    await control.query(
      "delete from auth.users where id = any($1::uuid[])",
      [[teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]]
    );

    console.log(
      JSON.stringify({
        harness: "planner-two-session-advisory-lock",
        status: "passed",
        order: observedOrder,
        xpOrder: xpObservedOrder,
        teamOrder: teamObservedOrder,
        teamSecondAcceptErrorCode,
        teamSecondAcceptErrorMessage,
        quotaAllowed: quotaAttempts.filter(
          (result) => result.rows[0]?.allowed
        ).length,
        staleScheduleErrorCode,
        staleScheduleErrorMessage,
        xpProfileTotal: xpTotalsRow.profile_total,
        xpLedgerTotal: xpTotalsRow.ledger_total,
      })
    );
  } finally {
    try {
      barriers.signal("release-session-a");
    } catch {
      // It was already released on the successful path.
    }
    await Promise.all([
      rollbackIfNeeded(sessionA),
      rollbackIfNeeded(sessionB),
    ]);
    try {
      await control.query("delete from auth.users where id = $1", [
        raceOwnerId,
      ]);
    } catch {
      // The setup may not have reached temporary-owner creation.
    }
    try {
      await control.query("delete from public.goals where id = $1", [xpRaceGoalId]);
      await control.query("delete from public.user_awards where user_id = $1", [
        xpRaceOwnerId,
      ]);
      await control.query("delete from public.xp_ledger where user_id = $1", [
        xpRaceOwnerId,
      ]);
      await control.query("delete from public.xp_profiles where user_id = $1", [
        xpRaceOwnerId,
      ]);
      await control.query("delete from public.profiles where id = $1", [xpRaceOwnerId]);
      await control.query("delete from auth.users where id = $1", [xpRaceOwnerId]);
    } catch {
      // The setup may not have reached XP race fixture creation.
    }
    try {
      await control.query(
        "delete from public.teams where id in ($1::uuid, $2::uuid)",
        [teamRaceTeamOneId, teamRaceTeamTwoId]
      );
      await control.query(
        "delete from public.profiles where id = any($1::uuid[])",
        [[teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]]
      );
      await control.query(
        "delete from auth.users where id = any($1::uuid[])",
        [[teamRacePrimaryId, teamRacePartnerBId, teamRacePartnerCId]]
      );
    } catch {
      // The setup may not have reached team-race fixture creation.
    }
    await Promise.all([sessionA.end(), sessionB.end(), control.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
