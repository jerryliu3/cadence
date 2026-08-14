import { describe, expect, it } from "vitest";
import type { CompletionSource } from "@/lib/goals/types";

const completionSources: CompletionSource[] = [
  "manual",
  "linked_cascade",
  "external_sync",
];

describe("CompletionSource", () => {
  it("includes external_sync with the existing completion sources", () => {
    expect(completionSources).toEqual([
      "manual",
      "linked_cascade",
      "external_sync",
    ]);
  });
});
