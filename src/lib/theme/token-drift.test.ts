import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cssTokenNames,
  darkTheme,
  lightTheme,
  type ThemeTokenName,
} from "@cadence/shared/tokens";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const globalsCss = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8");

function extractThemeBlock(selector: string) {
  const start = globalsCss.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = globalsCss.indexOf("{", start);
  const close = globalsCss.indexOf("}", open);
  return globalsCss.slice(open, close);
}

function readCssToken(block: string, cssName: string) {
  const match = block.match(new RegExp(`${cssName}:\\s*(oklch\\([^)]+\\));`));
  return match?.[1] ?? null;
}

describe("design token drift", () => {
  it("keeps shared light-theme oklch values aligned with globals.css", () => {
    const block = extractThemeBlock(":root {");
    for (const [tokenName, cssName] of Object.entries(cssTokenNames) as Array<
      [ThemeTokenName, string]
    >) {
      expect(readCssToken(block, cssName)).toBe(lightTheme[tokenName].oklch);
    }
  });

  it("keeps shared dark-theme oklch values aligned with globals.css", () => {
    const block = extractThemeBlock(".dark {");
    for (const [tokenName, cssName] of Object.entries(cssTokenNames) as Array<
      [ThemeTokenName, string]
    >) {
      expect(readCssToken(block, cssName)).toBe(darkTheme[tokenName].oklch);
    }
  });
});
