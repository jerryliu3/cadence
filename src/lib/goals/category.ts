import { cn } from "@/lib/utils";

export type CategoryPresetId = "health" | "career" | "personal" | "relationships" | "other";
export type CategorySelection = CategoryPresetId | "custom";

export const CATEGORY_PRESETS: Array<{
  id: CategoryPresetId;
  label: string;
}> = [
  { id: "health", label: "Health" },
  { id: "career", label: "Career" },
  { id: "personal", label: "Personal" },
  { id: "relationships", label: "Relationships" },
  { id: "other", label: "Other" },
];

const categorySwatchBySelection: Record<CategorySelection, string> = {
  health: "#10b981",
  career: "#8b5cf6",
  personal: "#6366f1",
  relationships: "#f43f5e",
  other: "#64748b",
  custom: "#64748b",
};

const presetLookup = new Map(
  CATEGORY_PRESETS.map((preset) => [preset.id, preset.label])
);

function toCategoryKey(raw: string | null | undefined): CategoryPresetId {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "health" ||
    normalized === "career" ||
    normalized === "personal" ||
    normalized === "relationships" ||
    normalized === "other"
  ) {
    return normalized;
  }

  return "other";
}

function isOtherLabel(category: string) {
  const normalized = category.trim().toLowerCase();
  return normalized === "" || normalized === "other";
}

export function getCategorySelectionFromValue(
  category: string,
  categoryKey?: string | null
) {
  const key = toCategoryKey(categoryKey ?? category);
  if (key === "other" && !isOtherLabel(category)) {
    return {
      selection: "custom" as const,
      customValue: category.trim(),
    };
  }
  return {
    selection: key,
    customValue: "",
  };
}

export function getCategoryKeyForSelection(selection: CategorySelection): CategoryPresetId {
  return selection === "custom" ? "other" : selection;
}

export function getCategoryLabel(
  selection: CategorySelection,
  customValue?: string
): string {
  if (selection === "custom") {
    const custom = customValue?.trim();
    return custom && custom.length > 0 ? custom : "Other";
  }
  return presetLookup.get(selection) ?? "Other";
}

export function getGoalCategoryLabel(
  category: string,
  categoryKey?: string | null
) {
  const key = toCategoryKey(categoryKey ?? category);
  if (key === "other" && !isOtherLabel(category)) {
    return category.trim();
  }
  return getCategoryLabel(key);
}

export function getCategoryBadgeClass(category: string): string {
  const normalized = toCategoryKey(category);

  if (normalized === "health") {
    return cn(
      "border-emerald-200 bg-emerald-100 text-emerald-700",
      "dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-200"
    );
  }

  if (normalized === "career") {
    return cn(
      "border-violet-200 bg-violet-100 text-violet-700",
      "dark:border-violet-700/40 dark:bg-violet-900/30 dark:text-violet-200"
    );
  }

  if (normalized === "personal") {
    return cn(
      "border-indigo-200 bg-indigo-100 text-indigo-700",
      "dark:border-indigo-700/40 dark:bg-indigo-900/30 dark:text-indigo-200"
    );
  }

  if (normalized === "relationships") {
    return cn(
      "border-rose-200 bg-rose-100 text-rose-700",
      "dark:border-rose-700/40 dark:bg-rose-900/30 dark:text-rose-200"
    );
  }

  return cn(
    "border-slate-200 bg-slate-100 text-slate-700",
    "dark:border-slate-700/40 dark:bg-slate-800/70 dark:text-slate-200"
  );
}

export function getCategorySwatchColor(selection: CategorySelection): string {
  return categorySwatchBySelection[selection];
}
