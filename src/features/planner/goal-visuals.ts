import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  Dumbbell,
  Heart,
  Lightbulb,
  Rocket,
  Star,
  Target,
} from "lucide-react";
import {
  getCategorySwatchColor,
  resolveCategoryKey,
  type CategoryPresetId,
} from "@/lib/goals/category";

const GOAL_ICONS: readonly LucideIcon[] = [
  Target,
  Rocket,
  BookOpen,
  Briefcase,
  Dumbbell,
  Heart,
  Lightbulb,
  Star,
];

const FALLBACK_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#0f766e",
  "#15803d",
  "#ca8a04",
  "#c2410c",
  "#be123c",
] as const;

const HEX_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;
type GoalVisualCategoryKey = Exclude<CategoryPresetId, "other">;

export interface GoalVisualInput {
  goalId: string;
  color: string | null;
  category: string | null;
}

export interface GoalVisual {
  Icon: LucideIcon;
  color: string;
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function normalizeGoalColor(color: string | null) {
  if (!color) {
    return null;
  }
  const trimmed = color.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function resolveCategorySwatchColor(category: string | null): string | null {
  if (!category || category.trim().length === 0) {
    return null;
  }
  const categoryKey = resolveCategoryKey(category);
  if (
    categoryKey !== "health" &&
    categoryKey !== "career" &&
    categoryKey !== "personal" &&
    categoryKey !== "relationships"
  ) {
    // Preserve goal-level colors for custom/unknown categories instead of forcing "other".
    return null;
  }
  return getCategorySwatchColor(categoryKey as GoalVisualCategoryKey);
}

export function getGoalVisual(input: GoalVisualInput): GoalVisual {
  const hash = stableHash(input.goalId);
  const categoryColor = resolveCategorySwatchColor(input.category);
  return {
    Icon: GOAL_ICONS[hash % GOAL_ICONS.length],
    color:
      categoryColor ??
      normalizeGoalColor(input.color) ??
      FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
  };
}
