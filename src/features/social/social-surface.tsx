"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChallengeList } from "@/features/social/challenges/challenge-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedList } from "@/features/social/feed/feed-list";
import { LeaderboardsPanel } from "@/features/social/leaderboards/leaderboards-panel";
import { DuoPanel } from "@/features/social/duo/duo-panel";
import type { SocialCapabilities } from "@/lib/social/capabilities";

function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function SocialSurface({ capabilities }: { capabilities: SocialCapabilities }) {
  return (
    <Tabs defaultValue="feed" className="space-y-4">
      <TabsList variant="line">
        <TabsTrigger value="feed">Feed</TabsTrigger>
        <TabsTrigger value="challenges">Challenges</TabsTrigger>
        <TabsTrigger value="leaderboards">Leaderboards</TabsTrigger>
        <TabsTrigger value="duo">Duo</TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="space-y-4">
        {!capabilities.socialFeedEnabled ? (
          <Placeholder
            title="Feed disabled"
            description="Enable SOCIAL_FEED_ENABLED to expose the social feed."
          />
        ) : (
          <FeedList />
        )}
      </TabsContent>

      <TabsContent value="challenges">
        {!capabilities.socialChallengesEnabled ? (
          <Placeholder
            title="Challenges disabled"
            description="Enable SOCIAL_CHALLENGES_ENABLED to expose challenge surfaces."
          />
        ) : (
          <ChallengeList />
        )}
      </TabsContent>

      <TabsContent value="leaderboards">
        {!capabilities.socialLeaderboardsEnabled ? (
          <Placeholder
            title="Leaderboards disabled"
            description="Enable SOCIAL_LEADERBOARDS_ENABLED to expose leaderboard seasons."
          />
        ) : (
          <LeaderboardsPanel />
        )}
      </TabsContent>

      <TabsContent value="duo">
        {!capabilities.socialDuoEnabled ? (
          <Placeholder
            title="Duo disabled"
            description="Enable SOCIAL_DUO_ENABLED to expose duo invite and partner workflows."
          />
        ) : (
          <DuoPanel />
        )}
      </TabsContent>
    </Tabs>
  );
}
