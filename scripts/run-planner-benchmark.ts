import { materializeWorstCaseKernelInput } from "../src/lib/planner/benchmark/worst-case";
import { runPlannerKernel } from "../src/lib/planner/kernel";

const SAMPLE_COUNT = 7;
const P95_TARGET_MS = 2_000;

function runSample() {
  const input = materializeWorstCaseKernelInput({ withBasePlan: true });
  const startedAt = performance.now();
  runPlannerKernel(input);
  return performance.now() - startedAt;
}

function main() {
  // Warm module caches before measuring the isolated performance gate.
  runSample();
  const durations = Array.from({ length: SAMPLE_COUNT }, runSample).sort(
    (left, right) => left - right
  );
  const p95Index = Math.ceil(durations.length * 0.95) - 1;
  const p95Ms = durations[p95Index];

  console.log(
    JSON.stringify({
      benchmark: "planner-worst-case-generation",
      sampleCount: SAMPLE_COUNT,
      p95Ms: Math.round(p95Ms * 100) / 100,
      targetMs: P95_TARGET_MS,
      status: p95Ms < P95_TARGET_MS ? "passed" : "failed",
    })
  );

  if (p95Ms >= P95_TARGET_MS) {
    throw new Error(
      `Planner generation p95 ${p95Ms.toFixed(2)}ms exceeded ${P95_TARGET_MS}ms.`
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
