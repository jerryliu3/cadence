"use client";

import { ChallengeList } from "@/features/social/challenges/challenge-list";
import { DuoPanel } from "@/features/social/duo/duo-panel";
import { FeedList } from "@/features/social/feed/feed-list";
import { LeaderboardsPanel } from "@/features/social/leaderboards/leaderboards-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SocialSurface() {
  return (
    <Tabs defaultValue="feed" className="space-y-4">
      <TabsList variant="line">
        <TabsTrigger value="feed">Feed</TabsTrigger>
        <TabsTrigger value="challenges">Challenges</TabsTrigger>
        <TabsTrigger value="leaderboards">Leaderboards</TabsTrigger>
        <TabsTrigger value="duo">Duo</TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="space-y-4">
        <FeedList />
      </TabsContent>
      <TabsContent value="challenges" className="space-y-4">
        <ChallengeList />
      </TabsContent>
      <TabsContent value="leaderboards" className="space-y-4">
        <LeaderboardsPanel />
      </TabsContent>
      <TabsContent value="duo" className="space-y-4">
        <DuoPanel />
      </TabsContent>
    </Tabs>
  );
}
