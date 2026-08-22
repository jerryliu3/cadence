export type StarterPackKey = "health" | "fitness";

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  const year = String(next.getFullYear());
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveStarterPackKey(rawValue: string | null): StarterPackKey | null {
  if (rawValue === "health" || rawValue === "fitness") {
    return rawValue;
  }
  return null;
}

export function buildStarterPackRows(pack: StarterPackKey, anchorDate: string) {
  if (pack === "health") {
    return [
      {
        title: "Hydration streak",
        description: "Drink enough water each day and keep the chain alive.",
        category: "Health",
        color: "#14b8a6",
        frequency_type: "recurring",
        recurrence_interval: "daily",
        target_count: "1",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 30),
      },
      {
        title: "Sleep 8 hours",
        description: "Track one full 8-hour sleep block every night.",
        category: "Health",
        color: "#6366f1",
        frequency_type: "recurring",
        recurrence_interval: "daily",
        target_count: "1",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 30),
      },
      {
        title: "Meal prep session",
        description: "Run a weekly meal prep block for the next two months.",
        category: "Health",
        color: "#f97316",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: "1",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 56),
      },
    ] as Record<string, unknown>[];
  }

  return [
    {
      title: "Strength training",
      description: "Complete three focused strength sessions each week.",
      category: "Fitness",
      color: "#dc2626",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: "3",
      start_date: anchorDate,
      end_date: addDays(anchorDate, 84),
    },
    {
      title: "Daily mobility",
      description: "Do a short mobility routine to stay injury resistant.",
      category: "Fitness",
      color: "#0ea5e9",
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: "1",
      start_date: anchorDate,
      end_date: addDays(anchorDate, 42),
    },
    {
      title: "Run a 5K milestone plan",
      description: "Build up to a full 5K run through progressive checkpoints.",
      category: "Fitness",
      color: "#22c55e",
      frequency_type: "fixed_milestones",
      target_count: "3",
      milestone_names: "2K run|3.5K run|5K run",
      start_date: anchorDate,
      end_date: addDays(anchorDate, 60),
    },
  ] as Record<string, unknown>[];
}
