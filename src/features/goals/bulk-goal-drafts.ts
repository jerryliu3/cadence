import { format, parseISO } from "date-fns";
import { toLocalDateString } from "@/lib/dates/day";
import {
  type CategorySelection,
  getCategoryKeyForSelection,
  getCategoryLabel,
  getCategorySelectionFromValue,
  getCategorySwatchColor,
} from "@/lib/goals/category";
import {
  isOrdinalGoalDefinition,
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";
import {
  buildMilestoneNameDrafts,
  normalizeMilestoneNamesForSave,
} from "@/lib/goals/milestones";
import type {
  GoalFrequencyType,
  RecurrenceInterval,
} from "@/lib/goals/types";

const columnAliases = {
  title: ["title", "goal", "goal_title", "name"],
  description: ["description", "details", "notes"],
  category: ["category", "tag"],
  color: ["color", "accent_color", "hex_color"],
  frequency_type: ["frequency_type", "frequency", "type"],
  recurrence_interval: ["recurrence_interval", "recurrence", "interval"],
  target_count: ["target_count", "target", "count", "milestones"],
  milestone_names: ["milestone_names", "milestones_list", "steps", "step_names"],
  start_date: ["start_date", "start", "startdate"],
  end_date: ["end_date", "end", "enddate", "due_date", "due"],
  default_local_time: ["default_local_time", "default_time", "time_of_day", "local_time"],
} as const;

export interface BulkGoalDraft {
  id: string;
  sourceRowLabel: string;
  include: boolean;
  title: string;
  description: string;
  category_selection: CategorySelection;
  custom_category: string;
  color: string;
  frequency_type: GoalFrequencyType;
  recurrence_interval: RecurrenceInterval;
  target_count: string;
  milestone_names: string[];
  start_date: string;
  end_date: string;
  default_local_time: string;
  linked_target_goal_id: string;
  link_target_search: string;
  link_target_open: boolean;
  advanced_open: boolean;
  photo_file: File | null;
  errors: string[];
}

export interface LlmGoalDraftPayload {
  title?: string;
  description?: string | null;
  category?: string | null;
  category_key?: string | null;
  frequency_type?: GoalFrequencyType;
  recurrence_interval?: RecurrenceInterval | null;
  target_count?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  default_local_time?: string | null;
}

export interface PreparedBulkGoalRow {
  draft: BulkGoalDraft;
  goalId: string;
  row: {
    id: string;
    title: string;
    description: string | null;
    category_key: string;
    category: string;
    color: string;
    frequency_type: GoalFrequencyType;
    recurrence_interval: RecurrenceInterval | null;
    target_count: number | null;
    milestone_names: string[] | null;
    start_date: string;
    end_date: string | null;
    default_local_time: string | null;
  };
}

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(row).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    accumulator[normalizeHeaderKey(key)] = value;
    return accumulator;
  }, {});
}

function extractText(row: Record<string, unknown>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = row[normalizeHeaderKey(alias)];
    if (value !== undefined && value !== null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return "";
}

function parseFrequencyType(raw: string): GoalFrequencyType {
  const normalized = raw.trim().toLowerCase();
  return normalized.includes("milestone") || normalized.includes("fixed")
    ? "fixed_milestones"
    : "recurring";
}

function parseRecurrenceInterval(raw: string): RecurrenceInterval {
  const normalized = raw.trim().toLowerCase();
  if (normalized.startsWith("week")) return "weekly";
  if (normalized.startsWith("month")) return "monthly";
  return "daily";
}

function normalizeDateValue(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return format(raw, "yyyy-MM-dd");
  }
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM-dd");
}

export function parseBulkGoalTargetCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isValidBulkGoalHexColor(raw: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(raw.trim());
}

export function isValidBulkGoalLocalTime(raw: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.trim());
}

export function normalizeBulkGoalLocalTime(raw: string): string {
  const trimmed = raw.trim();
  return trimmed && isValidBulkGoalLocalTime(trimmed) ? trimmed : "";
}

function parseMilestoneNames(raw: string): string[] {
  return raw
    .trim()
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function validateBulkGoalDraft(draft: BulkGoalDraft): string[] {
  const errors: string[] = [];
  const parsedTarget = parseBulkGoalTargetCount(draft.target_count);
  if (!draft.title.trim()) errors.push("Title is required.");
  if (draft.category_selection === "custom" && !draft.custom_category.trim()) {
    errors.push("Custom category name is required.");
  }
  if (!isValidBulkGoalHexColor(draft.color)) {
    errors.push("Color accent must be a valid hex color.");
  }
  if (
    draft.default_local_time.trim().length > 0 &&
    !isValidBulkGoalLocalTime(draft.default_local_time)
  ) {
    errors.push("Default time must be a valid 24-hour HH:MM value.");
  }
  if (draft.frequency_type === "fixed_milestones") {
    if (parsedTarget === null || parsedTarget <= 0) {
      errors.push("Milestone goals require a positive target count.");
    }
    if (parsedTarget !== null && draft.milestone_names.length !== parsedTarget) {
      errors.push("Milestone names must align with target count.");
    }
  }
  if (!draft.start_date) errors.push("Start date is required.");

  const definitionTargetCount =
    draft.frequency_type === "fixed_milestones"
      ? parsedTarget
      : draft.target_count.trim()
        ? parsedTarget
        : null;
  for (const issue of validateGoalDefinition({
    frequencyType: draft.frequency_type,
    targetCount: definitionTargetCount,
    startDate: draft.start_date,
    endDate: draft.end_date || null,
  })) {
    errors.push(issue.message);
  }
  return errors;
}

export function withValidatedBulkGoalDraft(
  draft: Omit<BulkGoalDraft, "errors">
): BulkGoalDraft {
  const candidate = { ...draft, errors: [] };
  return { ...candidate, errors: validateBulkGoalDraft(candidate) };
}

export function buildBulkGoalDraftFromRow(
  row: Record<string, unknown>,
  rowIndex: number
): BulkGoalDraft {
  const normalizedRow = normalizeRowKeys(row);
  const categoryRaw = extractText(normalizedRow, columnAliases.category);
  const categoryState = categoryRaw
    ? getCategorySelectionFromValue(categoryRaw)
    : { selection: "personal" as CategorySelection, customValue: "" };
  const frequencyType = parseFrequencyType(
    extractText(normalizedRow, columnAliases.frequency_type)
  );
  const targetRaw = extractText(normalizedRow, columnAliases.target_count);
  const parsedTarget = targetRaw
    ? parseBulkGoalTargetCount(targetRaw)
    : frequencyType === "fixed_milestones"
      ? 3
      : null;
  const parsedMilestoneNames = parseMilestoneNames(
    extractText(normalizedRow, columnAliases.milestone_names)
  );
  const parsedColor = extractText(normalizedRow, columnAliases.color);

  return withValidatedBulkGoalDraft({
    id: crypto.randomUUID(),
    sourceRowLabel: `Row ${rowIndex + 1}`,
    include: true,
    title: extractText(normalizedRow, columnAliases.title),
    description: extractText(normalizedRow, columnAliases.description),
    category_selection: categoryState.selection,
    custom_category: categoryState.customValue,
    color: isValidBulkGoalHexColor(parsedColor)
      ? parsedColor
      : getCategorySwatchColor(categoryState.selection),
    frequency_type: frequencyType,
    recurrence_interval: parseRecurrenceInterval(
      extractText(normalizedRow, columnAliases.recurrence_interval)
    ),
    target_count: targetRaw || (frequencyType === "fixed_milestones" ? "3" : ""),
    milestone_names:
      frequencyType === "fixed_milestones"
        ? buildMilestoneNameDrafts(parsedTarget ?? 0, parsedMilestoneNames)
        : [],
    start_date:
      normalizeDateValue(normalizedRow[normalizeHeaderKey(columnAliases.start_date[0])]) ||
      normalizeDateValue(extractText(normalizedRow, columnAliases.start_date)) ||
      toLocalDateString(),
    end_date:
      normalizeDateValue(normalizedRow[normalizeHeaderKey(columnAliases.end_date[0])]) ||
      normalizeDateValue(extractText(normalizedRow, columnAliases.end_date)),
    default_local_time: normalizeBulkGoalLocalTime(
      extractText(normalizedRow, columnAliases.default_local_time)
    ),
    linked_target_goal_id: "none",
    link_target_search: "",
    link_target_open: false,
    advanced_open: false,
    photo_file: null,
  });
}

export function buildBulkGoalDraftsFromLlmGoals(
  goals: LlmGoalDraftPayload[]
): BulkGoalDraft[] {
  return goals.map((goal, index) =>
    buildBulkGoalDraftFromRow(
      {
        title: goal.title ?? "",
        description: goal.description ?? "",
        category: goal.category ?? goal.category_key ?? "",
        frequency_type: goal.frequency_type ?? "recurring",
        recurrence_interval: goal.recurrence_interval ?? "",
        target_count:
          goal.target_count === null || goal.target_count === undefined
            ? ""
            : String(goal.target_count),
        start_date: goal.start_date ?? "",
        end_date: goal.end_date ?? "",
        default_local_time: goal.default_local_time ?? "",
      },
      index
    )
  );
}

export function bulkGoalDraftRequiresEndDate(draft: BulkGoalDraft): boolean {
  const parsedTargetCount = parseBulkGoalTargetCount(draft.target_count);
  return isOrdinalGoalDefinition({
    frequencyType: draft.frequency_type,
    targetCount:
      draft.frequency_type === "fixed_milestones"
        ? parsedTargetCount
        : draft.target_count.trim()
          ? parsedTargetCount
          : null,
  });
}

export function summarizeBulkGoalDraftSchedule(draft: BulkGoalDraft): string {
  const cadence =
    draft.frequency_type === "recurring"
      ? `${draft.recurrence_interval[0]!.toUpperCase()}${draft.recurrence_interval.slice(1)}`
      : `${draft.target_count || "0"} milestones`;
  const start = format(parseISO(draft.start_date), "MMM d");
  const range = draft.end_date
    ? `${start} – ${format(parseISO(draft.end_date), "MMM d")}`
    : `Starts ${start}`;
  return `${cadence} · ${range}`;
}

export function prepareBulkGoalRows(
  drafts: BulkGoalDraft[],
  { createId = () => crypto.randomUUID() }: { createId?: () => string } = {}
): PreparedBulkGoalRow[] {
  return drafts.map((draft) => {
    const parsedTargetCount = parseBulkGoalTargetCount(draft.target_count);
    const normalizedTargetCount =
      draft.frequency_type === "fixed_milestones"
        ? parsedTargetCount
        : parsedTargetCount !== null && parsedTargetCount > 0
          ? parsedTargetCount
          : null;
    const goalId = createId();
    return {
      draft,
      goalId,
      row: {
        id: goalId,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        category_key: getCategoryKeyForSelection(draft.category_selection),
        category: getCategoryLabel(
          draft.category_selection,
          draft.custom_category
        ),
        color: isValidBulkGoalHexColor(draft.color)
          ? draft.color.trim()
          : getCategorySwatchColor(draft.category_selection),
        frequency_type: draft.frequency_type,
        recurrence_interval:
          draft.frequency_type === "recurring"
            ? draft.recurrence_interval
            : null,
        target_count: normalizedTargetCount,
        milestone_names:
          draft.frequency_type === "fixed_milestones" && parsedTargetCount
            ? normalizeMilestoneNamesForSave(
                parsedTargetCount,
                draft.milestone_names
              )
            : null,
        start_date: draft.start_date,
        end_date: draft.end_date || null,
        default_local_time: draft.default_local_time.trim() || null,
      },
    };
  });
}
