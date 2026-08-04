import { spawn } from "node:child_process";

const timezones = ["America/Los_Angeles", "Pacific/Auckland"];
const testFiles = [
  "src/test/timezone-process.test.ts",
  "src/lib/goals/periods.test.ts",
  "src/lib/goals/timezone-domain.test.ts",
  "src/lib/goals/lifecycle.test.ts",
  "src/lib/planner/contracts/fixture-schema.test.ts",
];

function runTimezone(timezone) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "vitest", "run", ...testFiles, "--reporter=dot"],
      {
        cwd: process.cwd(),
        env: { ...process.env, TZ: timezone },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = [`TZ=${timezone}`, stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join("\n");

      if (code !== 0) {
        reject(new Error(`${output}\nTimezone test process exited with ${code}.`));
        return;
      }

      resolve(output);
    });
  });
}

const outputs = await Promise.all(timezones.map(runTimezone));
console.log(outputs.join("\n\n"));
