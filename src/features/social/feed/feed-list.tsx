"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchSocialFeedPage } from "@/features/social/data";
import { FeedEventCard } from "@/features/social/feed/feed-event-card";
import type { SocialFeedEvent } from "@/features/social/types";

export function FeedList() {
  const [items, setItems] = useState<SocialFeedEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFeed = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetchSocialFeedPage({
        cursor,
        scope: "global",
        limit: 20,
      });
      setItems((previous) => (cursor ? [...previous, ...response.items] : response.items));
      setNextCursor(response.nextCursor);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadFeed(null);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadFeed]);

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}
      {items.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">
          No activity yet. Feed events will appear as users make progress.
        </p>
      ) : null}
      {items.map((event) => (
        <FeedEventCard key={event.id} event={event} />
      ))}
      {nextCursor ? (
        <Button
          variant="outline"
          onClick={() => {
            void loadFeed(nextCursor);
          }}
          disabled={loading}
        >
          {loading ? "Loading..." : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
