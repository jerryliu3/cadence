import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  canonicalSerialize,
  sha256Hex,
} from "@/lib/planner/canonical";

describe("canonical planner serialization", () => {
  it("sorts object keys while preserving array order", () => {
    expect(
      canonicalSerialize({ z: 1, a: { y: 2, x: 3 }, rows: [2, 1] })
    ).toBe('{"a":{"x":3,"y":2},"rows":[2,1],"z":1}');
  });

  it("implements the standard SHA-256 vectors isomorphically", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("produces the same hash for differently ordered object keys", () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(
      canonicalHash({ a: 1, b: 2 })
    );
  });
});
