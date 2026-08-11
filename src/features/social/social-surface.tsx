"use client";

import { FeedList } from "@/features/social/feed/feed-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SocialSurface() {
  return (
    <Tabs defaultValue="feed" className="space-y-4">
      <TabsList variant="line">
        <TabsTrigger value="feed">Feed</TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="space-y-4">
        <FeedList />
      </TabsContent>
    </Tabs>
  );
}
