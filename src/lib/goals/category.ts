import { cn } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export interface GoalCategory {
  key: string;
  label: string;
  aliases: string[];
  color: string;
  sortOrder: number;
}

export type CategorySelection = string;

export const CATEGORY_CUSTOM_VALUE = "custom";

const GENERIC_OTHER_LABELS = new Set([
  "other",
  "general",
  "misc",
  "uncategorized",
  "custom",
  "test",
]);

export const DEFAULT_GOAL_CATEGORIES: GoalCategory[] = [
  {
    key: "personal",
    label: "Personal",
    aliases: ["self", "habits", "mindfulness", "home", "productivity"],
    color: "#6366f1",
    sortOrder: 10,
  },
  {
    key: "relationships",
    label: "Relationships",
    aliases: ["family", "friends", "social", "community", "partner"],
    color: "#f43f5e",
    sortOrder: 20,
  },
  {
    key: "health",
    label: "Health",
    aliases: ["fitness", "wellness", "wellbeing", "exercise", "workout", "nutrition", "sleep"],
    color: "#10b981",
    sortOrder: 30,
  },
  {
    key: "career",
    label: "Career",
    aliases: ["work", "professional", "business", "job"],
    color: "#8b5cf6",
    sortOrder: 40,
  },
  {
    key: "learning",
    label: "Learning",
    aliases: ["education", "study", "skills", "reading", "languages"],
    color: "#3b82f6",
    sortOrder: 50,
  },
  {
    key: "finance",
    label: "Finance",
    aliases: ["money", "budget", "savings", "investing"],
    color: "#ec4899",
    sortOrder: 60,
  },
  {
    key: "community",
    label: "Community",
    aliases: ["volunteer"],
    color: "#14b8a6",
    sortOrder: 70,
  },
  {
    key: "other",
    label: "Other",
    aliases: ["general", "uncategorized", "misc", "custom", "test"],
    color: "#64748b",
    sortOrder: 999,
  },
];

export const CATEGORY_PRESETS = DEFAULT_GOAL_CATEGORIES.filter(
  (category) => category.key !== "other"
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
  const normalized = category.trim().toLowerCase();

  if (categoryKey) {
    const keyed = categoryLookup.get(categoryKey);
    if (keyed && keyed.key !== "other") {
      return { selection: keyed.key, customValue: keyed.label };
    }
    if (keyed && keyed.key === "other") {
      const resolved = resolveCategoryKey(category, normalizedCatalog);
      if (resolved === "other" && !GENERIC_OTHER_LABELS.has(normalized) && normalized.length > 0) {
        return {
          selection: CATEGORY_CUSTOM_VALUE,
          customValue: category || "",
        };
      }
      return {
        selection: "other",
        customValue: category || keyed.label,
      };
    }
  }

  const resolved = resolveCategoryKey(category, normalizedCatalog);
  if (resolved !== "other") {
    const resolvedCategory = categoryLookup.get(resolved);
    return {
      selection: resolved,
      customValue: resolvedCategory?.label ?? category,
    };
  }

  if (normalized.length > 0 && !GENERIC_OTHER_LABELS.has(normalized)) {
    return {
      selection: CATEGORY_CUSTOM_VALUE,
      customValue: category || "",
    };
  }

  return {
    selection: "other",
    customValue: category || "",
  };
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
    return custom && custom.length > 0 ? custom : "Custom";
  }

  return categoryLookup.get(selection)?.label ?? "Custom";
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
    if (category.aliases.some((alias) => alias.toLowerCase() === normalizedInput)) {
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

  if (normalized === "learning") {
    return cn(
      "border-blue-200 bg-blue-100 text-blue-700",
      "dark:border-blue-700/40 dark:bg-blue-900/30 dark:text-blue-200"
    );
  }

  if (normalized === "finance") {
    return cn(
      "border-pink-200 bg-pink-100 text-pink-700",
      "dark:border-pink-700/40 dark:bg-pink-900/30 dark:text-pink-200"
    );
  }

  if (normalized === "community") {
    return cn(
      "border-cyan-200 bg-cyan-100 text-cyan-700",
      "dark:border-cyan-700/40 dark:bg-cyan-900/30 dark:text-cyan-200"
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
