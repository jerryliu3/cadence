"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface GlobalAchievementItem {
  id: string;
  title: string | null;
  level: number | null;
  description: string | null;
  unlockedAt: string;
  revokedAt: string | null;
}

const ACHIEVEMENT_VISIBLE_ROWS = 10.5;
const ACHIEVEMENT_ROW_HEIGHT_REM = 3.25;
const DEFAULT_SECTION_MAX_HEIGHT_REM =
  ACHIEVEMENT_VISIBLE_ROWS * ACHIEVEMENT_ROW_HEIGHT_REM;

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

export function GlobalAchievementsCard({
  achievements,
  title = "Global Achievements",
  maxHeightRem = DEFAULT_SECTION_MAX_HEIGHT_REM,
}: {
  achievements: GlobalAchievementItem[];
  title?: string;
  maxHeightRem?: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {achievements.length === 0 ? (
          <p className="text-muted-foreground">No global achievements yet.</p>
        ) : (
          <div
            className="space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight: `${maxHeightRem}rem` }}
          >
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div>
                  <p className="font-medium">{achievement.title ?? "XP achievement"}</p>
                  <p className="text-xs text-muted-foreground">
                    Level {achievement.level ?? "?"} · {formatDate(achievement.unlockedAt)}
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
