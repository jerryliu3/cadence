import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8"
);

describe("overlay scroll locking", () => {
  it("neutralizes body width compensation while preserving scroll lock", () => {
    expect(globalsCss).toMatch(
      /html body\[data-scroll-locked\]\s*\{[^}]*margin-right:\s*0\s*!important;[^}]*padding-right:\s*0\s*!important;[^}]*--removed-body-scroll-bar-size:\s*0px\s*!important;[^}]*\}/s
    );
  });
});
