import benchmarkWorstCase from "../../../../test/fixtures/planner-contracts/benchmark-worst-case.v1.json";
import completionDispatch from "../../../../test/fixtures/planner-contracts/completion-dispatch.v1.json";
import eligibility from "../../../../test/fixtures/planner-contracts/eligibility.v1.json";
import lifecycleOutcome from "../../../../test/fixtures/planner-contracts/lifecycle-outcome.v1.json";
import mutationFreshness from "../../../../test/fixtures/planner-contracts/mutation-freshness.v1.json";
import solver from "../../../../test/fixtures/planner-contracts/solver.v1.json";
import {
  plannerContractFixtureSchema,
  worstCaseBenchmarkSpecSchema,
} from "./fixture-schema";

const rawPlannerContractFixtures = [
  lifecycleOutcome,
  completionDispatch,
  eligibility,
  solver,
  mutationFreshness,
];

export function loadPlannerContractFixtures() {
  return rawPlannerContractFixtures.map((fixture) =>
    plannerContractFixtureSchema.parse(fixture)
  );
}

export function loadWorstCaseBenchmarkSpec() {
  return worstCaseBenchmarkSpecSchema.parse(benchmarkWorstCase);
}
