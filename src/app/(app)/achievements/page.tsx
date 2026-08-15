"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
            payload.achievedGoals.slice(0, 20).map((goal) => (
              <div key={goal.goalId} className="rounded-md border p-2">
                <p className="font-medium">{goal.title}</p>
                <p className="text-xs text-muted-foreground">
                  Achieved {formatDate(goal.achievedOn)}
                </p>
                {goal.rewardText ? (
                  <p className="mt-1 text-xs">{goal.rewardText}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Achievements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {payload.globalAchievements.length === 0 ? (
            <p className="text-muted-foreground">No global achievements yet.</p>
          ) : (
            payload.globalAchievements.slice(0, 20).map((achievement) => (
              <div
                key={achievement.id}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div>
                  <p className="font-medium">{achievement.title ?? "XP achievement"}</p>
                  <p className="text-xs text-muted-foreground">
                    Level {achievement.level ?? "?"} ·{" "}
                    {formatDate(achievement.unlockedAt)}
                  </p>
                  {achievement.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {achievement.description}
                    </p>
                  ) : null}
                </div>
                {achievement.revokedAt ? (
                  <Badge variant="secondary">Revoked</Badge>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
