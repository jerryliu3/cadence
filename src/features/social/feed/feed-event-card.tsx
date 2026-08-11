import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export function FeedEventCard({ event }: { event: SocialFeedEvent }) {
  const actorName = event.actor.displayName || `@${event.actor.username}`;
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{actorName}</p>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{getEventLabel(event.eventType)}</Badge>
          {event.categoryLabel ? <span>{event.categoryLabel}</span> : null}
        </div>
        <p className="text-sm">
          {event.goalTitle
            ? event.goalTitle
            : `${event.actor.username} earned ${event.xpDelta} XP`}
        </p>
      </CardContent>
    </Card>
  );
}
