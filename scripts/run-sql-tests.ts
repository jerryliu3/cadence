import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg, { type QueryResult } from "pg";

const { Client } = pg;
const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const testRoots = [
  path.resolve("supabase/tests/database"),
  path.resolve("supabase/tests/generated"),
];

async function collectSqlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSqlFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".sql") ? [entryPath] : [];
    })
  );

  return nested.flat().sort((left, right) => left.localeCompare(right));
}

function getTapLines(results: QueryResult | QueryResult[]) {
  const resultList = Array.isArray(results) ? results : [results];

  return resultList.flatMap((result) =>
    result.rows.flatMap((row) =>
      Object.values(row).filter(
        (value): value is string => typeof value === "string"
      )
    )
  );
}

async function runSqlFile(filePath: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("set statement_timeout = '30s'");
    const sql = await readFile(filePath, "utf8");
    const results = await client.query(sql);
    const tapLines = getTapLines(results);
    const planLine = tapLines.find((line) => /^1\.\.\d+$/.test(line));
    const failures = tapLines.filter((line) => line.startsWith("not ok"));

    if (!planLine) {
      throw new Error("SQL test did not emit a pgTAP plan.");
    }
    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }

    const expectedAssertions = Number(planLine.slice(3));
    const passedAssertions = tapLines.filter((line) =>
      line.startsWith("ok ")
    ).length;
    if (passedAssertions !== expectedAssertions) {
      throw new Error(
        `Expected ${expectedAssertions} pgTAP assertions but observed ${passedAssertions}.`
      );
    }

    console.log(
      `PASS ${path.relative(process.cwd(), filePath)} (${passedAssertions} assertions)`
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original SQL test failure.
    }
    throw new Error(
      `FAIL ${path.relative(process.cwd(), filePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await client.end();
  }
}

async function main() {
  const files = (
    await Promise.all(testRoots.map((directory) => collectSqlFiles(directory)))
  ).flat();

  if (files.length === 0) {
    throw new Error("No SQL test files found.");
  }

  for (const file of files) {
    await runSqlFile(file);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
