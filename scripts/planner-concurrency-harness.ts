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
const raceGoalAId = "44000000-0000-4000-8000-000000000001";
const raceGoalBId = "44000000-0000-4000-8000-000000000002";
const racePlanId = "45000000-0000-4000-8000-000000000001";

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
      `delete from private.planner_ai_usage_daily
       where owner_id = $1
         and usage_date = (clock_timestamp() at time zone 'UTC')::date
         and feature = 'planner_coach'`,
      [quotaOwnerId]
    );
    const quotaAttempts = await Promise.all(
      [sessionA, sessionB].map((session) =>
        session.query<{ allowed: boolean; request_count: number }>(
          `select allowed, request_count
           from private.consume_planner_ai_quota(
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
      `delete from private.planner_ai_usage_daily
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
       values
         (
           $1, $3, 'Race goal A', 'test', 'recurring',
           'weekly', 2, date_trunc('month', current_date)::date,
           (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
           false
         ),
         (
           $2, $3, 'Race goal B', 'test', 'recurring',
           'weekly', null, date_trunc('month', current_date)::date,
           (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
           false
         )`,
      [raceGoalAId, raceGoalBId, raceOwnerId]
    );

    const raceBarriers = new NamedBarriers([
      "plan-ready-before-commit",
      "link-requested-owner-lock",
      "commit-plan",
    ]);
    let linkRaceErrorCode: string | undefined;
    const publishTask = (async () => {
      await sessionA.query("begin");
      await sessionA.query(
        "select pg_advisory_xact_lock(private.planner_owner_lock_key($1::uuid))",
        [raceOwnerId]
      );
      await sessionA.query(
        `insert into public.execution_plans (
           id, owner_id, scope_month, eligibility_mode, timezone, version,
           status, generation_source, change_summary, policy_snapshot,
           generation_input_hash, observed_canonical_revision,
           observed_execution_revision, contract_version, scheduler_version,
           requirement_schema_version, assessment_schema_version,
           policy_schema_version, policy_compiler_version, placement_status,
           search_status, capacity_status, confirmation_required, publishable,
           idempotency_key, request_digest
         )
         select
           $1, $2, date_trunc('month', current_date)::date,
           'end_month_v1', 'UTC', 1, 'active', 'manual', '{}'::jsonb,
           '{
             "schemaVersion":"1",
             "timezone":"UTC",
             "timezoneConfirmedAt":"2026-08-01T00:00:00.000Z",
             "restWeekdays":[],
             "blackoutRanges":[],
             "goalAllowedWeekdays":{},
             "datePreferences":[],
             "spacingStrategy":"even",
             "goalSpacingStrategies":{},
             "dailyCadenceRestExemption":true
           }'::jsonb,
           repeat('a', 64), state.canonical_revision,
           state.execution_revision, '1', 'ordered-dp-v1', '1', '1', '1',
           '1', 'complete', 'all_units_placed', 'unverified', false, true,
           '45000000-0000-4000-8000-000000000099', repeat('b', 64)
         from private.planner_state state
         where state.owner_id = $2`,
        [racePlanId, raceOwnerId]
      );
      await sessionA.query(
        `insert into public.execution_plan_goals (
           plan_id, owner_id, goal_id, title, category, start_date, end_date,
           requirement_kind, requirement_fingerprint, requirement_snapshot,
           assessment_snapshot, assessment_input_hash,
           admissible_credit_basis, generation_summary
         )
         values (
           $1, $2, $3, 'Race goal A', 'test',
           date_trunc('month', current_date)::date,
           (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
           'deadline_total', repeat('c', 64),
           '{"schemaVersion":"1","requirement":{"kind":"deadline_total","targetCount":2,"spacingHint":"weekly","maxPerDay":1}}'::jsonb,
           '{"schemaVersion":"1"}'::jsonb, repeat('d', 64),
           '{"completionToUnit":{}}'::jsonb, '{}'::jsonb
         )`,
        [racePlanId, raceOwnerId, raceGoalAId]
      );
      raceBarriers.signal("plan-ready-before-commit");
      await raceBarriers.wait("commit-plan");
      await sessionA.query("commit");
    })();
    const linkTask = (async () => {
      await raceBarriers.wait("plan-ready-before-commit");
      await sessionB.query("begin");
      raceBarriers.signal("link-requested-owner-lock");
      try {
        await sessionB.query(
          `insert into public.goal_links (
             owner_id, source_goal_id, target_goal_id
           )
           values ($1, $2, $3)`,
          [raceOwnerId, raceGoalAId, raceGoalBId]
        );
        await sessionB.query("commit");
      } catch (error) {
        linkRaceErrorCode =
          error instanceof pg.DatabaseError ? error.code : undefined;
        await sessionB.query("rollback");
      }
    })();

    await raceBarriers.wait("link-requested-owner-lock");
    await waitForAdvisoryBlock(control, sessionBPid);
    raceBarriers.signal("commit-plan");
    await Promise.all([publishTask, linkTask]);
    assert.equal(
      linkRaceErrorCode,
      "55000",
      "A link waiting behind publication must observe active membership."
    );
    await control.query("delete from auth.users where id = $1", [
      raceOwnerId,
    ]);
    const cascadeResult = await control.query<{ count: string }>(
      `select count(*)::text as count
       from public.execution_plans
       where owner_id = $1`,
      [raceOwnerId]
    );
    assert.equal(
      cascadeResult.rows[0]?.count,
      "0",
      "Account deletion must cascade immutable planner history."
    );

    console.log(
      JSON.stringify({
        harness: "planner-two-session-advisory-lock",
        status: "passed",
        order: observedOrder,
        quotaAllowed: quotaAttempts.filter(
          (result) => result.rows[0]?.allowed
        ).length,
        linkRaceErrorCode,
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
    await Promise.all([sessionA.end(), sessionB.end(), control.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
