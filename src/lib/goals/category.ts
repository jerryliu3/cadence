import { cn } from "@/lib/utils";

export type CategoryPresetId =
  | "health"
  | "career"
  | "personal"
  | "relationships"
  | "other";
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

const GENERIC_OTHER_LABELS = new Set([
  "other",
  "general",
  "misc",
  "uncategorized",
  "custom",
  "test",
]);

export function getCategorySelectionFromValue(
  category: string,
  categoryKey?: string | null
): {
  selection: CategorySelection;
  customValue: string;
} {
  const normalizedCategoryKey = categoryKey?.trim().toLowerCase();
  if (
    normalizedCategoryKey === "health" ||
    normalizedCategoryKey === "career" ||
    normalizedCategoryKey === "personal" ||
    normalizedCategoryKey === "relationships"
  ) {
    return {
      selection: normalizedCategoryKey,
      customValue: presetLookup.get(normalizedCategoryKey) ?? category,
    };
  }

  const normalized = category.trim().toLowerCase();

  if (
    normalized === "health" ||
    normalized === "fitness" ||
    normalized === "wellness" ||
    normalized === "nutrition"
  ) {
    return { selection: "health", customValue: "Health" };
  }

  if (
    normalized === "career" ||
    normalized === "work" ||
    normalized === "professional" ||
    normalized === "business" ||
    normalized === "job"
  ) {
    return { selection: "career", customValue: "Career" };
  }

  if (
    normalized === "personal" ||
    normalized === "planning" ||
    normalized === "productivity" ||
    normalized === "home"
  ) {
    return { selection: "personal", customValue: "Personal" };
  }

  if (
    normalized === "relationships" ||
    normalized === "social" ||
    normalized === "family" ||
    normalized === "friends" ||
    normalized === "partner" ||
    normalized === "community"
  ) {
    return { selection: "relationships", customValue: "Relationships" };
  }

  if (GENERIC_OTHER_LABELS.has(normalized) || normalized.length === 0) {
    return { selection: "other", customValue: "Other" };
  }

  return {
    selection: "custom",
    customValue: category || "",
  };
}

export function getCategoryLabel(
  selection: CategorySelection,
  customValue?: string
): string {
  if (selection === "custom") {
    const custom = customValue?.trim();
    return custom && custom.length > 0 ? custom : "Custom";
  }

  return presetLookup.get(selection) ?? "Custom";
}

export function getGoalCategoryLabel(
  category: string,
  categoryKey?: string | null
) {
  const normalizedCategoryKey = categoryKey?.trim().toLowerCase();
  if (
    normalizedCategoryKey === "health" ||
    normalizedCategoryKey === "career" ||
    normalizedCategoryKey === "personal" ||
    normalizedCategoryKey === "relationships"
  ) {
    return presetLookup.get(normalizedCategoryKey) ?? category;
  }
  if (normalizedCategoryKey === "other") {
    const normalizedCategory = category.trim().toLowerCase();
    if (GENERIC_OTHER_LABELS.has(normalizedCategory) || normalizedCategory.length === 0) {
      return "Other";
    }
  }
  return category;
}

export function getCategoryBadgeClass(category: string): string {
  const normalized = category.trim().toLowerCase();

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
