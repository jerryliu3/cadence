import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;

const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const statementTimeoutMs = 10_000;
const observationTimeoutMs = 5_000;
const ownerLockName = "calendar-planner:test-owner-lock";

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
        "select pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
        [ownerLockName]
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
        "select pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
        [ownerLockName]
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

    assert.deepEqual(observedOrder, [
      "session-a-acquired",
      "session-b-observed-blocked",
      "session-a-committed",
      "session-b-acquired",
      "session-b-committed",
    ]);

    console.log(
      JSON.stringify({
        harness: "planner-two-session-advisory-lock",
        status: "passed",
        order: observedOrder,
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
    await Promise.all([sessionA.end(), sessionB.end(), control.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
