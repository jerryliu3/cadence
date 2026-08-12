"use client";

import { ChallengeList } from "@/features/social/challenges/challenge-list";
import { FeedList } from "@/features/social/feed/feed-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SocialSurface() {
  return (
    <Tabs defaultValue="feed" className="space-y-4">
      <TabsList variant="line">
        <TabsTrigger value="feed">Feed</TabsTrigger>
        <TabsTrigger value="challenges">Challenges</TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="space-y-4">
        <FeedList />
      </TabsContent>
      <TabsContent value="challenges" className="space-y-4">
        <ChallengeList />
      </TabsContent>
    </Tabs>
  );
}
