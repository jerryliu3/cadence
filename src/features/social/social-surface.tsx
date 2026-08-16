"use client";

import { Flag, Newspaper, Trophy, Users } from "lucide-react";
import { ChallengeList } from "@/features/social/challenges/challenge-list";
import { CohortJoinCard } from "@/features/social/cohort-join-card";
import { TeamPanel } from "@/features/social/team/team-panel";
import { FeedList } from "@/features/social/feed/feed-list";
import { LeaderboardsPanel } from "@/features/social/leaderboards/leaderboards-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  resolveSocialSurfaceTab,
  type SocialSurfaceTab,
} from "@/features/social/social-surface-tab";

export function SocialSurface({
  initialTab,
}: {
  initialTab?: string;
}) {
  const defaultTab: SocialSurfaceTab = resolveSocialSurfaceTab(initialTab);

  return (
    <Tabs defaultValue={defaultTab} className="flex flex-col gap-4">
      <TabsList
        variant="line"
        className="grid w-full grid-cols-4 gap-1.5 rounded-2xl bg-transparent p-0"
      >
        <TabsTrigger
          value="feed"
          className="h-10 min-w-0 flex-col gap-0.5 rounded-xl border border-sky-300/70 bg-gradient-to-b from-sky-100/95 to-sky-50/90 px-1.5 py-1 text-[10px] font-semibold leading-tight text-sky-900 shadow-[0_3px_0_rgba(14,116,144,0.28)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_1px_0_rgba(14,116,144,0.22)] data-active:translate-y-[2px] data-active:border-sky-500 data-active:from-sky-200 data-active:to-sky-100 data-active:shadow-[0_1px_0_rgba(14,116,144,0.24)] dark:border-sky-500/50 dark:from-sky-900/80 dark:to-sky-800/70 dark:text-sky-100 dark:shadow-[0_3px_0_rgba(3,7,18,0.6)] dark:data-active:border-sky-300 dark:data-active:from-sky-700/80 dark:data-active:to-sky-600/70 after:hidden"
        >
          <Newspaper className="size-3.5" />
          <span className="truncate">Feed</span>
        </TabsTrigger>
        <TabsTrigger
          value="challenges"
          className="h-10 min-w-0 flex-col gap-0.5 rounded-xl border border-amber-300/70 bg-gradient-to-b from-amber-100/95 to-amber-50/90 px-1.5 py-1 text-[10px] font-semibold leading-tight text-amber-900 shadow-[0_3px_0_rgba(180,83,9,0.28)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_1px_0_rgba(180,83,9,0.22)] data-active:translate-y-[2px] data-active:border-amber-500 data-active:from-amber-200 data-active:to-amber-100 data-active:shadow-[0_1px_0_rgba(180,83,9,0.24)] dark:border-amber-500/50 dark:from-amber-900/80 dark:to-amber-800/70 dark:text-amber-100 dark:shadow-[0_3px_0_rgba(3,7,18,0.6)] dark:data-active:border-amber-300 dark:data-active:from-amber-700/80 dark:data-active:to-amber-600/70 after:hidden"
        >
          <Trophy className="size-3.5" />
          <span className="truncate">Challenges</span>
        </TabsTrigger>
        <TabsTrigger
          value="leaderboards"
          className="h-10 min-w-0 flex-col gap-0.5 rounded-xl border border-violet-300/70 bg-gradient-to-b from-violet-100/95 to-violet-50/90 px-1.5 py-1 text-[10px] font-semibold leading-tight text-violet-900 shadow-[0_3px_0_rgba(109,40,217,0.28)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_1px_0_rgba(109,40,217,0.22)] data-active:translate-y-[2px] data-active:border-violet-500 data-active:from-violet-200 data-active:to-violet-100 data-active:shadow-[0_1px_0_rgba(109,40,217,0.24)] dark:border-violet-500/50 dark:from-violet-900/80 dark:to-violet-800/70 dark:text-violet-100 dark:shadow-[0_3px_0_rgba(3,7,18,0.6)] dark:data-active:border-violet-300 dark:data-active:from-violet-700/80 dark:data-active:to-violet-600/70 after:hidden"
        >
          <Flag className="size-3.5" />
          <span className="truncate">Leaderboards</span>
        </TabsTrigger>
        <TabsTrigger
          value="team"
          className="h-10 min-w-0 flex-col gap-0.5 rounded-xl border border-emerald-300/70 bg-gradient-to-b from-emerald-100/95 to-emerald-50/90 px-1.5 py-1 text-[10px] font-semibold leading-tight text-emerald-900 shadow-[0_3px_0_rgba(5,150,105,0.28)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-[0_1px_0_rgba(5,150,105,0.22)] data-active:translate-y-[2px] data-active:border-emerald-500 data-active:from-emerald-200 data-active:to-emerald-100 data-active:shadow-[0_1px_0_rgba(5,150,105,0.24)] dark:border-emerald-500/50 dark:from-emerald-900/80 dark:to-emerald-800/70 dark:text-emerald-100 dark:shadow-[0_3px_0_rgba(3,7,18,0.6)] dark:data-active:border-emerald-300 dark:data-active:from-emerald-700/80 dark:data-active:to-emerald-600/70 after:hidden"
        >
          <Users className="size-3.5" />
          <span className="truncate">Team</span>
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
