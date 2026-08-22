import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8"
);

describe("global link color cascade", () => {
  it("keeps the anchor reset in the base layer so utility colors can override it", () => {
    expect(globalsCss).toMatch(
      /@layer base\s*\{[\s\S]*?a\s*\{[^}]*color:\s*inherit;[^}]*text-decoration:\s*none;[^}]*\}/
    );
  });
});
