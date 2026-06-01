import { cn } from "@/lib/utils";

export type CategoryPresetId = "personal" | "relationships" | "health";
export type CategorySelection = CategoryPresetId | "custom";

export const CATEGORY_PRESETS: Array<{
  id: CategoryPresetId;
  label: string;
}> = [
  { id: "personal", label: "Personal" },
  { id: "relationships", label: "Relationships" },
  { id: "health", label: "Health" },
];

const categorySwatchBySelection: Record<CategorySelection, string> = {
  personal: "#6366f1",
  relationships: "#f43f5e",
  health: "#10b981",
  custom: "#64748b",
};

const presetLookup = new Map(
  CATEGORY_PRESETS.map((preset) => [preset.id, preset.label])
);

export function getCategorySelectionFromValue(category: string): {
  selection: CategorySelection;
  customValue: string;
} {
  const normalized = category.trim().toLowerCase();

  if (normalized === "personal") {
    return { selection: "personal", customValue: "Personal" };
  }

  if (normalized === "relationships") {
    return { selection: "relationships", customValue: "Relationships" };
  }

  if (normalized === "health") {
    return { selection: "health", customValue: "Health" };
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

export function getCategoryBadgeClass(category: string): string {
  const normalized = category.trim().toLowerCase();

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

  if (normalized === "health") {
    return cn(
      "border-emerald-200 bg-emerald-100 text-emerald-700",
      "dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-200"
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
