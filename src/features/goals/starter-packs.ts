export const STARTER_PACKS = [
  {
    key: "health",
    label: "Health",
  },
  {
    key: "fitness",
    label: "Fitness",
  },
  {
    key: "career",
    label: "Career",
  },
  {
    key: "personal",
    label: "Personal",
  },
  {
    key: "relationships",
    label: "Relationships",
  },
] as const;

export type StarterPackKey = (typeof STARTER_PACKS)[number]["key"];

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  const year = String(next.getFullYear());
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolveStarterPackKey(rawValue: string | null): StarterPackKey | null {
  if (!rawValue) {
    return null;
  }
  if (STARTER_PACKS.some((pack) => pack.key === rawValue)) {
    return rawValue as StarterPackKey;
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

  if (pack === "fitness") {
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

  if (pack === "career") {
    return [
      {
        title: "Weekly deep work block",
        description: "Protect focused work sessions for your highest leverage projects.",
        category: "Career",
        color: "#8b5cf6",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: "3",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 70),
      },
      {
        title: "Portfolio update cadence",
        description: "Ship one visible update to your portfolio each month.",
        category: "Career",
        color: "#6366f1",
        frequency_type: "recurring",
        recurrence_interval: "monthly",
        target_count: "1",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 120),
      },
      {
        title: "Promotion packet milestones",
        description: "Collect artifacts and outcomes required for your next review cycle.",
        category: "Career",
        color: "#0ea5e9",
        frequency_type: "fixed_milestones",
        target_count: "3",
        milestone_names: "Impact evidence|Manager sync|Packet finalized",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 90),
      },
    ] as Record<string, unknown>[];
  }

  if (pack === "personal") {
    return [
      {
        title: "Morning planning reset",
        description: "Run a quick daily reset to keep your priorities intentional.",
        category: "Personal",
        color: "#6366f1",
        frequency_type: "recurring",
        recurrence_interval: "daily",
        target_count: "1",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 30),
      },
      {
        title: "Weekly life admin sweep",
        description: "Clear errands, docs, and inbox backlog before the next week starts.",
        category: "Personal",
        color: "#f59e0b",
        frequency_type: "recurring",
        recurrence_interval: "weekly",
        target_count: "1",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 56),
      },
      {
        title: "Declutter your space",
        description: "Tidy high-friction areas so your routines stay easy to maintain.",
        category: "Personal",
        color: "#14b8a6",
        frequency_type: "fixed_milestones",
        target_count: "3",
        milestone_names: "Desk reset|Closet pass|Kitchen reset",
        start_date: anchorDate,
        end_date: addDays(anchorDate, 45),
      },
    ] as Record<string, unknown>[];
  }

  return [
    {
      title: "Weekly partner check-in",
      description: "Set one intentional check-in to align on goals and support.",
      category: "Relationships",
      color: "#f43f5e",
      frequency_type: "recurring",
      recurrence_interval: "weekly",
      target_count: "1",
      start_date: anchorDate,
      end_date: addDays(anchorDate, 70),
    },
    {
      title: "Acts of appreciation",
      description: "Share one specific appreciation each day.",
      category: "Relationships",
      color: "#fb7185",
      frequency_type: "recurring",
      recurrence_interval: "daily",
      target_count: "1",
      start_date: anchorDate,
      end_date: addDays(anchorDate, 30),
    },
    {
      title: "Plan quality time",
      description: "Create and schedule meaningful shared experiences.",
      category: "Relationships",
      color: "#ec4899",
      frequency_type: "fixed_milestones",
      target_count: "3",
      milestone_names: "Pick activity|Set date|Complete activity",
      start_date: anchorDate,
      end_date: addDays(anchorDate, 60),
    },
  ] as Record<string, unknown>[];
}
