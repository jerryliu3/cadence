"use client";

import { Flag, Newspaper, Trophy, Users } from "lucide-react";
import { ChallengeList } from "@/features/social/challenges/challenge-list";
import { CohortJoinCard } from "@/features/social/cohort-join-card";
import { TeamPanel } from "@/features/social/team/team-panel";
import { FeedList } from "@/features/social/feed/feed-list";
import { LeaderboardsPanel } from "@/features/social/leaderboards/leaderboards-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SocialSurface() {
  return (
    <Tabs defaultValue="feed" className="flex flex-col gap-4">
      <TabsList
        variant="line"
        className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-transparent p-0 sm:grid-cols-4"
      >
        <TabsTrigger
          value="feed"
          className="h-12 gap-2 rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/70 px-4 text-sm font-semibold text-foreground shadow-[0_4px_0_rgba(15,23,42,0.16)] transition-transform hover:-translate-y-0.5 dark:shadow-[0_4px_0_rgba(0,0,0,0.45)] data-active:translate-y-[2px] data-active:border-primary/45 data-active:from-primary/20 data-active:to-primary/10 data-active:text-primary data-active:shadow-[0_2px_0_rgba(15,23,42,0.12)] dark:data-active:shadow-[0_2px_0_rgba(0,0,0,0.4)] after:hidden"
        >
          <Newspaper className="size-4" />
          <span>Feed</span>
        </TabsTrigger>
        <TabsTrigger
          value="challenges"
          className="h-12 gap-2 rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/70 px-4 text-sm font-semibold text-foreground shadow-[0_4px_0_rgba(15,23,42,0.16)] transition-transform hover:-translate-y-0.5 dark:shadow-[0_4px_0_rgba(0,0,0,0.45)] data-active:translate-y-[2px] data-active:border-primary/45 data-active:from-primary/20 data-active:to-primary/10 data-active:text-primary data-active:shadow-[0_2px_0_rgba(15,23,42,0.12)] dark:data-active:shadow-[0_2px_0_rgba(0,0,0,0.4)] after:hidden"
        >
          <Trophy className="size-4" />
          <span>Challenges</span>
        </TabsTrigger>
        <TabsTrigger
          value="leaderboards"
          className="h-12 gap-2 rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/70 px-4 text-sm font-semibold text-foreground shadow-[0_4px_0_rgba(15,23,42,0.16)] transition-transform hover:-translate-y-0.5 dark:shadow-[0_4px_0_rgba(0,0,0,0.45)] data-active:translate-y-[2px] data-active:border-primary/45 data-active:from-primary/20 data-active:to-primary/10 data-active:text-primary data-active:shadow-[0_2px_0_rgba(15,23,42,0.12)] dark:data-active:shadow-[0_2px_0_rgba(0,0,0,0.4)] after:hidden"
        >
          <Flag className="size-4" />
          <span>Leaderboards</span>
        </TabsTrigger>
        <TabsTrigger
          value="team"
          className="h-12 gap-2 rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/70 px-4 text-sm font-semibold text-foreground shadow-[0_4px_0_rgba(15,23,42,0.16)] transition-transform hover:-translate-y-0.5 dark:shadow-[0_4px_0_rgba(0,0,0,0.45)] data-active:translate-y-[2px] data-active:border-primary/45 data-active:from-primary/20 data-active:to-primary/10 data-active:text-primary data-active:shadow-[0_2px_0_rgba(15,23,42,0.12)] dark:data-active:shadow-[0_2px_0_rgba(0,0,0,0.4)] after:hidden"
        >
          <Users className="size-4" />
          <span>Team</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="space-y-4">
        <FeedList />
      </TabsContent>
      <TabsContent value="challenges" className="space-y-4">
        <CohortJoinCard />
        <ChallengeList />
      </TabsContent>
      <TabsContent value="leaderboards" className="space-y-4">
        <LeaderboardsPanel />
      </TabsContent>
      <TabsContent value="team" className="space-y-4">
        <TeamPanel />
      </TabsContent>
    </Tabs>
  );
}
