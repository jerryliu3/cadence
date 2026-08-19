"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicProfileBundle } from "@cadence/shared/social/public-profile";
import { UserAvatar } from "@/components/user-avatar";
import { XpProgressCard } from "@/components/xp/xp-progress-card";
import { GlobalAchievementsCard } from "@/features/achievements/global-achievements-card";
import { InsightsOverallStatsCard } from "@/features/insights/insights-overall-stats-card";
import { GoalRouteSheet } from "@/features/goals/goal-route-sheet";
import { fetchPublicProfileBundle } from "@/features/social/public-profile/data";
import { getHeatmapScaleClass } from "@/lib/goals/heatmap";

function resolveProfileLabel(profile: PublicProfileBundle["profile"]) {
  if (profile.displayName?.trim()) {
    return profile.displayName.trim();
  }
  if (profile.username?.trim()) {
    return `@${profile.username.trim()}`;
  }
  return "Cadence user";
}

export function PublicProfileSheet({
  subjectUserId,
  onClose,
}: {
  subjectUserId: string;
  onClose: () => void;
}) {
  const selectedYear = useMemo(() => new Date().getUTCFullYear(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<PublicProfileBundle | null>(null);
  const heatmapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setBundle(null);
      try {
        const response = await fetchPublicProfileBundle({
          subjectUserId,
          year: selectedYear,
        });
        if (!cancelled) {
          setBundle(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Public profile could not be loaded."
          );
          setBundle(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, subjectUserId]);

  const title = useMemo(() => {
    if (bundle) {
      return resolveProfileLabel(bundle.profile);
    }
    return "Profile";
  }, [bundle]);

  return (
    <GoalRouteSheet onClose={onClose} title={title} closeButtonLabel="Close profile">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      ) : error || !bundle ? (
        <p className="text-sm text-destructive">
          {error ?? "Public profile could not be loaded."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <UserAvatar
              avatarUrl={bundle.profile.avatarUrl}
              displayName={bundle.profile.displayName}
              username={bundle.profile.username}
              size="lg"
              alt={`${title} avatar`}
            />
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold">{title}</p>
              {bundle.profile.username ? (
                <p className="text-sm text-muted-foreground">@{bundle.profile.username}</p>
              ) : null}
            </div>
          </div>

          {bundle.profile.isPrivate ? (
            <p className="text-sm text-muted-foreground">This account is private</p>
          ) : (
            <>
              {bundle.xp ? <XpProgressCard profile={bundle.xp} /> : null}
              <GlobalAchievementsCard achievements={bundle.globalAchievements} />
              <InsightsOverallStatsCard
                heatmapRef={heatmapRef}
                selectedYearStart={new Date(`${selectedYear}-01-01`)}
                selectedYearEnd={new Date(`${selectedYear}-12-31`)}
                values={bundle.yearHeatmap}
                overallCompletion={0}
                overallStats={bundle.overallStats}
                classForValue={(value) => getHeatmapScaleClass(value?.count ?? 0)}
                titleForValue={(value) =>
                  `${value?.date ?? "N/A"}: ${value?.count ?? 0} completion${
                    (value?.count ?? 0) === 1 ? "" : "s"
                  }`
                }
                onDayClick={() => undefined}
                showMoreLink={false}
              />
            </>
          )}
        </div>
      )}
    </GoalRouteSheet>
  );
}
