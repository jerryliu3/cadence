import { describe, expect, it } from "vitest";
import {
  isValidHexColor,
  isValidLocalTime,
  normalizeGoalDateValue,
  normalizeLocalTimeValue,
  parseBooleanCellValue,
  parseGoalTargetCount,
} from "./form-parsing";

describe("form parsing helpers", () => {
  it("parses goal target counts with optional positive-only mode", () => {
    expect(parseGoalTargetCount("12")).toBe(12);
    expect(parseGoalTargetCount("0")).toBe(0);
    expect(parseGoalTargetCount("0", { requirePositive: true })).toBeNull();
    expect(parseGoalTargetCount("-2", { requirePositive: true })).toBeNull();
    expect(parseGoalTargetCount("nope")).toBeNull();
    expect(parseGoalTargetCount("")).toBeNull();
  });

  it("validates and normalizes local time values", () => {
    expect(isValidLocalTime("08:30")).toBe(true);
    expect(isValidLocalTime("24:00")).toBe(false);
    expect(normalizeLocalTimeValue(" 08:30 ")).toBe("08:30");
    expect(normalizeLocalTimeValue("8:30")).toBe("");
  });

  it("validates hex color values", () => {
    expect(isValidHexColor("#A1b2C3")).toBe(true);
    expect(isValidHexColor("#abc")).toBe(false);
  });

  it("parses boolean-like csv values", () => {
    expect(parseBooleanCellValue("true")).toBe(true);
    expect(parseBooleanCellValue("YES")).toBe(true);
    expect(parseBooleanCellValue("0")).toBe(false);
  });

  it("normalizes date-like values from strings and Date objects", () => {
    expect(normalizeGoalDateValue("2026-08-10")).toBe("2026-08-10");
    expect(normalizeGoalDateValue("Aug 10, 2026")).toBe("2026-08-10");
    expect(normalizeGoalDateValue(new Date("2026-08-10T12:00:00.000Z"))).toBe(
      "2026-08-10"
    );
    expect(normalizeGoalDateValue("invalid")).toBe("");
  });
});
