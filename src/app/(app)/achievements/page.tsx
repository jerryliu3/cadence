"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GlobalAchievementsCard,
  type GlobalAchievementItem,
} from "@/features/achievements/global-achievements-card";

interface AchievementsPayload {
  achievedGoals: Array<{
    goalId: string;
    title: string;
    rewardText: string | null;
    achievedOn: string | null;
  }>;
  globalAchievements: Array<{
    id: string;
    title: string | null;
    level: number | null;
    description: string | null;
    unlockedAt: string;
    revokedAt: string | null;
  }>;
  truncated: {
    goals: boolean;
    completions: boolean;
  };
}

const GOAL_ACHIEVEMENTS_SECTION_MAX_HEIGHT_REM = 10.5 * 3.25;

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

function toGlobalAchievementItems(
  achievements: AchievementsPayload["globalAchievements"]
): GlobalAchievementItem[] {
  return achievements.map((achievement) => ({
    id: achievement.id,
    title: achievement.title,
    level: achievement.level,
    description: achievement.description,
    unlockedAt: achievement.unlockedAt,
    revokedAt: achievement.revokedAt,
  }));
}

export default function AchievementsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AchievementsPayload | null>(null);

  const loadAchievements = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/xp/achievements", {
        method: "GET",
        headers: { "Cache-Control": "no-store" },
      });
      if (!response.ok) {
        throw new Error("Achievements could not be loaded.");
      }
      const body = (await response.json()) as AchievementsPayload & {
        correlationId: string;
      };
      setPayload(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Achievements could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAchievements();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadAchievements]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Achievements</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Loading achievements...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Achievements</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive">
            {error ?? "Achievements could not be loaded."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <GlobalAchievementsCard
        achievements={toGlobalAchievementItems(payload.globalAchievements)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Goal Achievements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {payload.truncated.goals || payload.truncated.completions ? (
            <p className="text-muted-foreground">
              Showing a bounded achievements snapshot for this account.
            </p>
          ) : null}
          {payload.achievedGoals.length === 0 ? (
            <p className="text-muted-foreground">No achieved goals yet.</p>
          ) : (
            <div
              className="space-y-3 overflow-y-auto pr-1"
              style={{ maxHeight: `${GOAL_ACHIEVEMENTS_SECTION_MAX_HEIGHT_REM}rem` }}
            >
              {payload.achievedGoals.map((goal) => (
                <div key={goal.goalId} className="rounded-md border p-2">
                  <p className="font-medium">{goal.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Achieved {formatDate(goal.achievedOn)}
                  </p>
                  {goal.rewardText ? (
                    <p className="mt-1 text-xs">{goal.rewardText}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
