import { describe, expect, it } from "vitest";
import {
  filterAdminSyntheticUsers,
  type AdminSyntheticUser,
} from "@/features/admin/synthetic-users";

function user(overrides: Partial<AdminSyntheticUser>): AdminSyntheticUser {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    username: "noah_nguyen",
    displayName: "Noah Nguyen",
    socialActivityVisible: true,
    persona: "medium",
    archetype: "student",
    dailyBudget: 3,
    completionsToday: 1,
    lastActiveDate: "2026-08-22",
    enabled: true,
    goalCount: 6,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterAdminSyntheticUsers", () => {
  const items = [
    user({ userId: "1", username: "noah_nguyen", displayName: "Noah Nguyen", persona: "high", archetype: "student" }),
    user({ userId: "2", username: "ava_patel", displayName: "Ava Patel", persona: "low", archetype: "nurse", enabled: false }),
    user({ userId: "3", username: "liam_chen", displayName: "Liam Chen", persona: "medium", archetype: "teacher" }),
  ];

  it("filters by username, display name, or archetype query", () => {
    expect(filterAdminSyntheticUsers(items, { query: "NOAH", persona: "all", enabled: "all" }).map((row) => row.username)).toEqual([
      "noah_nguyen",
    ]);
    expect(filterAdminSyntheticUsers(items, { query: "patel", persona: "all", enabled: "all" }).map((row) => row.username)).toEqual([
      "ava_patel",
    ]);
    expect(filterAdminSyntheticUsers(items, { query: "teach", persona: "all", enabled: "all" }).map((row) => row.username)).toEqual([
      "liam_chen",
    ]);
  });

  it("filters by persona and enabled state", () => {
    expect(filterAdminSyntheticUsers(items, { query: "", persona: "low", enabled: "all" }).map((row) => row.username)).toEqual([
      "ava_patel",
    ]);
    expect(filterAdminSyntheticUsers(items, { query: "", persona: "all", enabled: "false" }).map((row) => row.username)).toEqual([
      "ava_patel",
    ]);
  });
});
