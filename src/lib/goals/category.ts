import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export interface GoalCategory {
  key: string;
  label: string;
  aliases: string[];
  color: string;
  sortOrder: number;
}

export type CategoryPresetId = "health" | "career" | "personal" | "relationships" | "other";
export type CategorySelection = CategoryPresetId | typeof CATEGORY_CUSTOM_VALUE;

export const CATEGORY_CUSTOM_VALUE = "custom";

const GENERIC_OTHER_LABELS = new Set(["other"]);
const CATEGORY_PRESET_IDS: readonly CategoryPresetId[] = [
  "health",
  "career",
  "personal",
  "relationships",
  "other",
];

function isCategoryPresetId(value: string): value is CategoryPresetId {
  return (CATEGORY_PRESET_IDS as readonly string[]).includes(value);
}

export const DEFAULT_GOAL_CATEGORIES: GoalCategory[] = [
  {
    key: "health",
    label: "Health",
    aliases: [],
    color: "#10b981",
    sortOrder: 10,
  },
  {
    key: "career",
    label: "Career",
    aliases: [],
    color: "#8b5cf6",
    sortOrder: 20,
  },
  {
    key: "personal",
    label: "Personal",
    aliases: [],
    color: "#6366f1",
    sortOrder: 30,
  },
  {
    key: "relationships",
    label: "Relationships",
    aliases: [],
    color: "#f43f5e",
    sortOrder: 40,
  },
  {
    key: "other",
    label: "Other",
    aliases: [],
    color: "#64748b",
    sortOrder: 999,
  },
];

export const CATEGORY_PRESETS = DEFAULT_GOAL_CATEGORIES.filter(
  (
    category
  ): category is GoalCategory & {
    key: Exclude<CategoryPresetId, "other">;
  } => isCategoryPresetId(category.key) && category.key !== "other"
).map((category) => ({
  id: category.key,
  label: category.label,
}));

function normalizeCategoryCatalog(categories: GoalCategory[]) {
  if (categories.length === 0) {
    return DEFAULT_GOAL_CATEGORIES;
  }

  return [...categories].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.key.localeCompare(right.key);
  });
}

function buildLookup(categories: GoalCategory[]) {
  return new Map(categories.map((category) => [category.key, category]));
}

export function getCategorySelectionFromValue(category: string): {
  selection: CategorySelection;
  customValue: string;
};
export function getCategorySelectionFromValue(
  category: string,
  categories: GoalCategory[],
  categoryKey?: string | null
): {
  selection: CategorySelection;
  customValue: string;
};
export function getCategorySelectionFromValue(
  category: string,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES,
  categoryKey?: string | null
): {
  selection: CategorySelection;
  customValue: string;
} {
  const normalizedCatalog = normalizeCategoryCatalog(categories);
  const categoryLookup = buildLookup(normalizedCatalog);
  const trimmedCategory = category.trim();
  const normalized = trimmedCategory.toLowerCase();

  if (categoryKey) {
    const keyed = categoryLookup.get(categoryKey.trim());
    if (keyed && isCategoryPresetId(keyed.key) && keyed.key !== "other") {
      return { selection: keyed.key, customValue: "" };
    }
    if ((keyed && keyed.key === "other") || categoryKey.trim().toLowerCase() === "other") {
      if (!GENERIC_OTHER_LABELS.has(normalized) && normalized.length > 0) {
        return { selection: CATEGORY_CUSTOM_VALUE, customValue: trimmedCategory };
      }
      return {
        selection: "other",
        customValue: "",
      };
    }
  }

  const resolved = resolveCategoryKey(category, normalizedCatalog);
  if (resolved !== "other" && isCategoryPresetId(resolved)) {
    return {
      selection: resolved,
      customValue: "",
    };
  }

  if (normalized.length > 0 && !GENERIC_OTHER_LABELS.has(normalized)) {
    return {
      selection: CATEGORY_CUSTOM_VALUE,
      customValue: trimmedCategory,
    };
  }

  return {
    selection: "other",
    customValue: "",
  };
}

export function getCategoryKeyForSelection(selection: CategorySelection): string {
  if (!selection || selection === CATEGORY_CUSTOM_VALUE) {
    return "other";
  }
  return selection;
}

export function getCategoryLabel(
  selection: CategorySelection,
  customValue?: string,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES
): string {
  const normalizedCatalog = normalizeCategoryCatalog(categories);
  const categoryLookup = buildLookup(normalizedCatalog);

  if (selection === CATEGORY_CUSTOM_VALUE) {
    const custom = customValue?.trim();
    return custom && custom.length > 0 ? custom : "Other";
  }

  return categoryLookup.get(selection)?.label ?? "Other";
}

export function resolveCategoryKey(
  labelOrKey: string,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES
): string {
  const normalizedCatalog = normalizeCategoryCatalog(categories);
  const normalizedInput = labelOrKey.trim().toLowerCase();
  if (normalizedInput.length === 0) {
    return "other";
  }

  for (const category of normalizedCatalog) {
    if (normalizedInput === category.key.toLowerCase()) {
      return category.key;
    }
    if (normalizedInput === category.label.toLowerCase()) {
      return category.key;
    }
  }

  return "other";
}

export function getCategoryValueForWrite(
  selection: CategorySelection,
  customValue?: string,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES
): {
  category: string;
  categoryKey: string;
} {
  const categoryLabel = getCategoryLabel(selection, customValue, categories);
  if (selection === CATEGORY_CUSTOM_VALUE) {
    return {
      category: categoryLabel,
      categoryKey: "other",
    };
  }

  return {
    category: categoryLabel,
    categoryKey: selection || "other",
  };
}

export function getGoalCategoryLabel(
  category: string,
  categoryKey: string | null | undefined,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES
) {
  const normalizedCatalog = normalizeCategoryCatalog(categories);
  const categoryLookup = buildLookup(normalizedCatalog);
  const key = categoryKey?.trim();
  if (key && key !== "other") {
    const fromCatalog = categoryLookup.get(key);
    if (fromCatalog) {
      return fromCatalog.label;
    }
  }
  return category;
}

export function getCategoryBadgeClass(categoryKey: string): string {
  const normalized = categoryKey.trim().toLowerCase();

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

  if (normalized === "career") {
    return cn(
      "border-violet-200 bg-violet-100 text-violet-700",
      "dark:border-violet-700/40 dark:bg-violet-900/30 dark:text-violet-200"
    );
  }

  return cn(
    "border-slate-200 bg-slate-100 text-slate-700",
    "dark:border-slate-700/40 dark:bg-slate-800/70 dark:text-slate-200"
  );
}

export function getCategorySwatchColor(
  selection: CategorySelection,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES
): string {
  if (selection === CATEGORY_CUSTOM_VALUE) {
    return "#64748b";
  }

  const normalizedCatalog = normalizeCategoryCatalog(categories);
  const categoryLookup = buildLookup(normalizedCatalog);
  return categoryLookup.get(selection)?.color ?? "#64748b";
}

export async function fetchGoalCategories(
  supabase: Pick<SupabaseClient<Database>, "from">
): Promise<GoalCategory[]> {
  const { data, error } = await supabase
    .from("goal_categories")
    .select("key, label, aliases, color, sort_order")
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    return DEFAULT_GOAL_CATEGORIES;
  }

  return normalizeCategoryCatalog(
    data.map((row) => ({
      key: row.key,
      label: row.label,
      aliases: row.aliases ?? [],
      color: row.color ?? "#64748b",
      sortOrder: row.sort_order,
    }))
  );
}
