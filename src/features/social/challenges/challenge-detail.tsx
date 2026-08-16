"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { joinSocialChallenge, leaveSocialChallenge } from "@/features/social/data";
import type { SocialChallenge } from "@/features/social/types";

function metricLabel(metric: SocialChallenge["metric"]) {
  switch (metric) {
    case "total_xp":
      return "Total XP";
    case "category_xp":
      return "Category XP";
    case "completions_count":
      return "Completions";
    case "distinct_active_days":
      return "Active Days";
    case "max_streak_days":
      return "Max Streak";
    default:
      return metric;
  }
}

export function ChallengeDetail({
  challenge,
  onUpdated,
}: {
  challenge: SocialChallenge;
  onUpdated: () => Promise<void>;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    setIsPending(true);
    setError(null);
    try {
      await joinSocialChallenge(challenge.id);
      await onUpdated();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join challenge.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleLeave() {
    setIsPending(true);
    setError(null);
    try {
      await leaveSocialChallenge(challenge.id);
      await onUpdated();
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "Could not leave challenge.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{challenge.title}</CardTitle>
        <CardDescription>
          {metricLabel(challenge.metric)}
          {challenge.metricTrackKey ? ` (${challenge.metricTrackKey})` : ""} · Target{" "}
          {challenge.targetValue} · {challenge.subjectKind === "team" ? "Team challenge" : "Solo challenge"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {challenge.description ? (
          <p className="text-muted-foreground">{challenge.description}</p>
        ) : null}

        <div className="space-y-1">
          <p>
            Status: <span className="font-medium">{challenge.status}</span>
          </p>
          {challenge.audienceKind === "group" ? (
            <p>
              Audience: <span className="font-medium">Group</span>
            </p>
          ) : null}
          <p>
            Participants: <span className="font-medium">{challenge.participantCount}</span>
          </p>
          <p>
            {challenge.subjectKind === "team" ? "Your team progress" : "Your progress"}:{" "}
            <span className="font-medium">{challenge.viewerProgress ?? 0}</span>
          </p>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {challenge.viewerJoined ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleLeave()}
            disabled={isPending || challenge.status === "closed"}
          >
            Leave challenge
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void handleJoin()}
            disabled={isPending || challenge.status === "closed"}
          >
            Join challenge
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
