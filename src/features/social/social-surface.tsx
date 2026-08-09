"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedList } from "@/features/social/feed/feed-list";
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
        <Placeholder
          title="Challenges staged"
          description="Challenge surfaces will appear as social challenge phases are enabled."
        />
      </TabsContent>

      <TabsContent value="leaderboards">
        <Placeholder
          title="Leaderboards staged"
          description="Leaderboard season surfaces are behind rollout flags until phase completion."
        />
      </TabsContent>

      <TabsContent value="duo">
        <Placeholder
          title="Duo staged"
          description="Duo partner workflows will appear after the duo core migration is enabled."
        />
      </TabsContent>
    </Tabs>
  );
}
