import { ApiRouteError } from "@/lib/api/route";

export const SYNTHETIC_PERSONAS = ["low", "medium", "high"] as const;

export type SyntheticPersona = (typeof SYNTHETIC_PERSONAS)[number];

export interface AdminSyntheticUser {
  userId: string;
  username: string;
  displayName: string | null;
  socialActivityVisible: boolean;
  persona: SyntheticPersona;
  archetype: string;
  dailyBudget: number;
  completionsToday: number;
  lastActiveDate: string | null;
  enabled: boolean;
  goalCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSyntheticConfig {
  enabled: boolean;
  maxCompletionsPerTick: number;
  maxReactionsPerTick: number;
  throttleAboveRealDau: number;
}

function asPersona(value: unknown): SyntheticPersona {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

export function toAdminSyntheticUserDto(row: Record<string, unknown>): AdminSyntheticUser {
  return {
    userId: String(row.user_id ?? ""),
    username: String(row.username ?? ""),
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    socialActivityVisible: row.social_activity_visible === true,
    persona: asPersona(row.persona),
    archetype: String(row.archetype ?? ""),
    dailyBudget: Number(row.daily_budget ?? 0),
    completionsToday: Number(row.completions_today ?? 0),
    lastActiveDate: typeof row.last_active_date === "string" ? row.last_active_date : null,
    enabled: row.enabled === true,
    goalCount: Number(row.goal_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function toAdminSyntheticConfigDto(row: Record<string, unknown>): AdminSyntheticConfig {
  return {
    enabled: row.enabled === true,
    maxCompletionsPerTick: Number(row.max_completions_per_tick ?? 0),
    maxReactionsPerTick: Number(row.max_reactions_per_tick ?? 0),
    throttleAboveRealDau: Number(row.throttle_above_real_dau ?? 0),
  };
}

export interface AdminSyntheticUserFilters {
  query: string;
  persona: "all" | SyntheticPersona;
  enabled: "all" | "true" | "false";
}

export function filterAdminSyntheticUsers(
  items: AdminSyntheticUser[],
  filters: AdminSyntheticUserFilters
): AdminSyntheticUser[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.persona !== "all" && item.persona !== filters.persona) {
      return false;
    }
    if (filters.enabled === "true" && !item.enabled) {
      return false;
    }
    if (filters.enabled === "false" && item.enabled) {
      return false;
    }
    if (query.length === 0) {
      return true;
    }
    return (
      item.username.toLowerCase().includes(query) ||
      (item.displayName ?? "").toLowerCase().includes(query) ||
      item.archetype.toLowerCase().includes(query)
    );
  });
}

export type DbMutationError = {
  message: string;
  code?: string | null;
};

export function mapSyntheticUserMutationError(
  error: DbMutationError,
  fallbackCode: string,
  fallbackMessage: string
) {
  if (error.code === "23505") {
    return new ApiRouteError(409, "synthetic_username_conflict", "Username already exists.");
  }
  if (error.message.includes("admin_synthetic_username_invalid")) {
    return new ApiRouteError(400, "synthetic_username_invalid", "Username format is invalid.");
  }
  if (error.message.includes("admin_synthetic_archetype_invalid")) {
    return new ApiRouteError(400, "synthetic_archetype_invalid", "Archetype is invalid.");
  }
  if (error.message.includes("admin_synthetic_user_id_immutable")) {
    return new ApiRouteError(400, "synthetic_user_id_immutable", "Synthetic user id cannot be changed.");
  }
  if (error.code === "23514") {
    return new ApiRouteError(400, "synthetic_user_invalid", "Synthetic user fields failed validation.");
  }
  return new ApiRouteError(500, fallbackCode, fallbackMessage, {
    cause: error.message,
  });
}
