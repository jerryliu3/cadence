import { describe, expect, it } from "vitest";
import { createClientUuid } from "@cadence/shared/ids";

describe("createClientUuid", () => {
  it("returns a UUID-shaped id", () => {
    expect(createClientUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8]{1}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });
});
