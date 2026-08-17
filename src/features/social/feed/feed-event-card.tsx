import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { ReactionBar } from "@/features/social/feed/reaction-bar";
import type { SocialFeedEvent } from "@/features/social/types";

function getEventLabel(eventType: SocialFeedEvent["eventType"]) {
  switch (eventType) {
    case "xp_earned":
      return "XP earned";
    case "level_up":
      return "Level up";
    case "goal_achieved":
      return "Goal achieved";
    case "challenge_completed":
      return "Challenge completed";
    case "season_result":
      return "Season result";
    case "team_formed":
      return "Team formed";
    default:
      return "Activity";
  }
}

function firstNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveFeedItemTitle(event: SocialFeedEvent): string | null {
  const directGoalTitle = firstNonEmptyString(event.goalTitle);
  if (directGoalTitle) {
    return directGoalTitle;
  }
  const payload = event.payload;
  const payloadTitle =
    firstNonEmptyString(payload["goalTitle"]) ??
    firstNonEmptyString(payload["goal_title"]) ??
    firstNonEmptyString(payload["itemTitle"]) ??
    firstNonEmptyString(payload["item_title"]) ??
    firstNonEmptyString(payload["title"]) ??
    firstNonEmptyString(payload["name"]);
  return payloadTitle;
}

export function FeedEventCard({ event }: { event: SocialFeedEvent }) {
  const actorName = event.actor.displayName || `@${event.actor.username}`;
  const itemTitle = resolveFeedItemTitle(event);
  const eventSummary = itemTitle
    ? itemTitle
    : event.xpDelta > 0
      ? `${event.actor.username} earned ${event.xpDelta} XP`
      : getEventLabel(event.eventType);
  const categoryBadgeLabel = event.categoryLabel ?? getEventLabel(event.eventType);

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-1.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <UserAvatar
              avatarUrl={event.actor.avatarUrl}
              displayName={event.actor.displayName}
              username={event.actor.username}
              size="sm"
              alt={`${actorName} avatar`}
            />
            <p className="truncate text-sm font-medium">{actorName}</p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              variant={event.categoryLabel ? "secondary" : "outline"}
              className="h-5 shrink-0 px-2 text-[10px]"
            >
              {categoryBadgeLabel}
            </Badge>
            <p className="min-w-0 truncate text-xs text-muted-foreground">{eventSummary}</p>
          </div>
          <ReactionBar
            className="ml-auto shrink-0"
            eventId={event.id}
            initialCount={event.reactionCount}
            initiallyReacted={event.viewerReacted}
          />
        </div>
      </CardContent>
    </Card>
  );
}
