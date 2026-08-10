import { format } from "date-fns";

export const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseGoalTargetCount(
  value: string,
  options: { requirePositive?: boolean } = {}
): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (options.requirePositive && parsed <= 0) {
    return null;
  }
  return parsed;
}

export function isValidHexColor(raw: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(raw.trim());
}

export function isValidLocalTime(raw: string): boolean {
  return LOCAL_TIME_PATTERN.test(raw.trim());
}

export function normalizeLocalTimeValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  return isValidLocalTime(trimmed) ? trimmed : "";
}

export function parseBooleanCellValue(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "y"
  );
}

export function normalizeGoalDateValue(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return format(raw, "yyyy-MM-dd");
  }

  const text = String(raw ?? "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return format(parsed, "yyyy-MM-dd");
}
