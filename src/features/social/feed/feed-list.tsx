"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchSocialFeedHead, fetchSocialFeedPage } from "@/features/social/data";
import { FeedEventCard } from "@/features/social/feed/feed-event-card";
import type { SocialFeedEvent } from "@/features/social/types";

interface FeedListProps {
  isActive?: boolean;
  refreshToken?: number;
}

const FEED_NEW_ACTIVITY_POLL_INTERVAL_MS = 30 * 1000;

export function FeedList({ isActive = true, refreshToken = 0 }: FeedListProps) {
  const [items, setItems] = useState<SocialFeedEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedInitialPage, setHasLoadedInitialPage] = useState(false);
  const [latestLoadedItemId, setLatestLoadedItemId] = useState<string | null>(null);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const pollInFlightRef = useRef(false);

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
      if (!cursor) {
        setHasLoadedInitialPage(true);
        setLatestLoadedItemId(response.items[0]?.id ?? null);
        setHasNewActivity(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const checkForNewActivity = useCallback(async () => {
    if (!isActive || !hasLoadedInitialPage || document.visibilityState !== "visible") {
      return;
    }
    if (pollInFlightRef.current) {
      return;
    }
    pollInFlightRef.current = true;
    try {
      const response = await fetchSocialFeedHead({ scope: "global" });
      const newestItemId = response.items[0]?.id ?? null;
      if (newestItemId && newestItemId !== latestLoadedItemId) {
        setHasNewActivity(true);
      }
    } catch {
      // Ignore transient polling failures and keep the current feed view.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [hasLoadedInitialPage, isActive, latestLoadedItemId]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void loadFeed(null);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isActive, loadFeed, refreshToken]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void checkForNewActivity();
    }, FEED_NEW_ACTIVITY_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [checkForNewActivity, isActive]);

  return (
    <div className="space-y-3">
      {hasNewActivity ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void loadFeed(null);
          }}
          disabled={loading}
        >
          New activity available. Refresh feed.
        </Button>
      ) : null}
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
