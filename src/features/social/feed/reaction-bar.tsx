"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addSocialFeedReaction, removeSocialFeedReaction } from "@/features/social/data";
import type { FeedReactionKind } from "@/features/social/data";

export function ReactionBar({
  eventId,
  initialCount,
  initiallyReacted,
}: {
  eventId: string;
  initialCount: number;
  initiallyReacted: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [reacted, setReacted] = useState(initiallyReacted);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleReaction(kind: FeedReactionKind) {
    setError(null);
    setIsPending(true);
    try {
      if (reacted) {
        await removeSocialFeedReaction({ eventId, reaction: kind });
        setReacted(false);
        setCount((value) => Math.max(value - 1, 0));
      } else {
        await addSocialFeedReaction({ eventId, reaction: kind });
        setReacted(true);
        setCount((value) => value + 1);
      }
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : "Reaction failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant={reacted ? "default" : "outline"}
        disabled={isPending}
        onClick={() => {
          void toggleReaction("cheer");
        }}
      >
        {reacted ? "Cheered" : "Cheer"} · {count}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
