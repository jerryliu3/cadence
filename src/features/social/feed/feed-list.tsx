"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fetchSocialFeedHead, fetchSocialFeedPage } from "@/features/social/data";
import { FeedEventCard } from "@/features/social/feed/feed-event-card";
import type { SocialFeedEvent } from "@/features/social/types";

interface FeedListProps {
  isActive?: boolean;
  refreshToken?: number;
}

const FEED_NEW_ACTIVITY_POLL_INTERVAL_MS = 60 * 1000;
const FEED_PULL_TO_REFRESH_THRESHOLD_PX = 72;
const FEED_PULL_TO_REFRESH_MAX_PX = 96;

export function FeedList({ isActive = true, refreshToken = 0 }: FeedListProps) {
  const [items, setItems] = useState<SocialFeedEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedInitialPage, setHasLoadedInitialPage] = useState(false);
  const [latestLoadedItemId, setLatestLoadedItemId] = useState<string | null>(null);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const pollInFlightRef = useRef(false);
  const pullStartYRef = useRef<number | null>(null);
  const isPullActiveRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const pullRefreshInFlightRef = useRef(false);

  const setPullDistanceState = useCallback((distance: number) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  }, []);

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

  const startPull = useCallback((startY: number) => {
    if (!isActive || loading || document.visibilityState !== "visible") {
      return;
    }
    if (window.scrollY > 0) {
      return;
    }
    pullStartYRef.current = startY;
    isPullActiveRef.current = true;
    setPullDistanceState(0);
  }, [isActive, loading, setPullDistanceState]);

  const updatePull = useCallback((currentY: number) => {
    if (!isPullActiveRef.current || pullStartYRef.current === null) {
      return;
    }
    const deltaY = currentY - pullStartYRef.current;
    if (deltaY <= 0) {
      setPullDistanceState(0);
      return;
    }
    setPullDistanceState(
      Math.min(FEED_PULL_TO_REFRESH_MAX_PX, deltaY * 0.65)
    );
  }, [setPullDistanceState]);

  const triggerPullRefresh = useCallback(async () => {
    if (pullRefreshInFlightRef.current) {
      return;
    }
    pullRefreshInFlightRef.current = true;
    setIsPullRefreshing(true);
    try {
      await loadFeed(null);
    } finally {
      setIsPullRefreshing(false);
      pullRefreshInFlightRef.current = false;
    }
  }, [loadFeed]);

  const endPull = useCallback(() => {
    if (!isPullActiveRef.current) {
      return;
    }
    const shouldRefresh =
      pullDistanceRef.current >= FEED_PULL_TO_REFRESH_THRESHOLD_PX;
    isPullActiveRef.current = false;
    pullStartYRef.current = null;
    setPullDistanceState(0);
    if (shouldRefresh) {
      void triggerPullRefresh();
    }
  }, [setPullDistanceState, triggerPullRefresh]);

  const cancelPull = useCallback(() => {
    isPullActiveRef.current = false;
    pullStartYRef.current = null;
    setPullDistanceState(0);
  }, [setPullDistanceState]);

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

  const showPullIndicator = pullDistance > 0 || isPullRefreshing;
  const readyToRefresh = pullDistance >= FEED_PULL_TO_REFRESH_THRESHOLD_PX;

  return (
    <div
      className="space-y-3"
      data-testid="feed-list"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) {
          startPull(touch.clientY);
        }
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        updatePull(touch.clientY);
        if (pullDistanceRef.current > 0) {
          event.preventDefault();
        }
      }}
      onTouchEnd={() => {
        endPull();
      }}
      onTouchCancel={() => {
        cancelPull();
      }}
      onPointerDown={(event) => {
        startPull(event.clientY);
      }}
      onPointerMove={(event) => {
        updatePull(event.clientY);
      }}
      onPointerUp={() => {
        endPull();
      }}
      onPointerCancel={() => {
        cancelPull();
      }}
    >
      <div
        className="overflow-hidden transition-all duration-150"
        style={{ height: showPullIndicator ? Math.max(28, pullDistance) : 0 }}
      >
        <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
          {isPullRefreshing ? (
            <RefreshCw className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowDown
              className={cn(
                "size-4 transition-transform duration-150",
                readyToRefresh ? "rotate-180" : ""
              )}
              aria-hidden
            />
          )}
          <span>
            {isPullRefreshing
              ? "Refreshing feed..."
              : readyToRefresh
                ? "Release to refresh"
                : "Pull to refresh"}
          </span>
        </div>
      </div>

      {hasNewActivity ? (
        <p className="text-xs text-muted-foreground">
          New activity available. Pull down to refresh.
        </p>
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
