import { createHash } from "node:crypto";

export function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical planner values must contain finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareCanonicalStrings(left, right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  throw new TypeError(`Unsupported canonical planner value: ${typeof value}`);
}

export function compareCanonicalStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalSerialize(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalHash(value: unknown) {
  return sha256Hex(canonicalSerialize(value));
}
