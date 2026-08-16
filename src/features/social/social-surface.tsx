"use client";

import { Flag, Newspaper, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { ChallengeList } from "@/features/social/challenges/challenge-list";
import { GroupJoinCard } from "@/features/social/group-join-card";
import { TeamPanel } from "@/features/social/team/team-panel";
import { FeedList } from "@/features/social/feed/feed-list";
import { LeaderboardsPanel } from "@/features/social/leaderboards/leaderboards-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  resolveSocialSurfaceTab,
  type SocialSurfaceTab,
} from "@/features/social/social-surface-tab";
import { cn } from "@/lib/utils";

const socialSurfaceTriggerBaseClass =
  "h-10 min-w-0 flex-col gap-0.5 rounded-xl px-1.5 py-1 text-[10px] font-semibold leading-tight transition-[transform,box-shadow,border-color,background-color] duration-150 hover:-translate-y-0.5 active:translate-y-[3px] data-[state=active]:translate-y-[3px] data-[state=active]:hover:translate-y-[3px] data-[state=active]:cursor-default after:hidden";

// Saved alternate (former Leaderboards): indigo-300 border, an
// indigo-200/blue-100/blue-50 gradient, and indigo-300/blue-200/blue-100
// when selected, with a rgba(79, 70, 229, 0.22) raised shadow.
const socialSurfaceTriggerToneClass =
  "border border-sky-300/80 bg-gradient-to-bl from-sky-200/95 via-blue-100/95 to-sky-50/90 text-sky-950 shadow-[0_3px_0_rgba(2,132,199,0.22)] data-[state=active]:border-sky-500 data-[state=active]:from-sky-300/95 data-[state=active]:via-blue-200/95 data-[state=active]:to-sky-100";

const selectedChipShadow =
  "inset 0 4px 7px rgba(15, 23, 42, 0.3), inset 2px 0 4px rgba(15, 23, 42, 0.16), inset -1px 0 0 rgba(255, 255, 255, 0.42), inset 0 -2px 1px rgba(255, 255, 255, 0.72)";

export function SocialSurface({
  initialTab,
}: {
  initialTab?: string;
}) {
  const defaultTab: SocialSurfaceTab = resolveSocialSurfaceTab(initialTab);
  const [activeTab, setActiveTab] = useState<SocialSurfaceTab>(defaultTab);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as SocialSurfaceTab)}
      className="flex flex-col gap-4"
    >
      <TabsList
        variant="line"
        className="grid w-full grid-cols-4 gap-1.5 rounded-2xl bg-transparent p-0"
      >
        <TabsTrigger
          value="feed"
          className={cn(
            socialSurfaceTriggerBaseClass,
            socialSurfaceTriggerToneClass
          )}
          style={
            activeTab === "feed" ? { boxShadow: selectedChipShadow } : undefined
          }
        >
          <Newspaper className="size-3.5" />
          <span className="truncate">Feed</span>
        </TabsTrigger>
        <TabsTrigger
          value="challenges"
          className={cn(
            socialSurfaceTriggerBaseClass,
            socialSurfaceTriggerToneClass
          )}
          style={
            activeTab === "challenges"
              ? { boxShadow: selectedChipShadow }
              : undefined
          }
        >
          <Trophy className="size-3.5" />
          <span className="truncate">Challenges</span>
        </TabsTrigger>
        <TabsTrigger
          value="leaderboards"
          className={cn(
            socialSurfaceTriggerBaseClass,
            socialSurfaceTriggerToneClass
          )}
          style={
            activeTab === "leaderboards"
              ? { boxShadow: selectedChipShadow }
              : undefined
          }
        >
          <Flag className="size-3.5" />
          <span className="truncate">Leaderboards</span>
        </TabsTrigger>
        <TabsTrigger
          value="team"
          className={cn(
            socialSurfaceTriggerBaseClass,
            socialSurfaceTriggerToneClass
          )}
          style={
            activeTab === "team" ? { boxShadow: selectedChipShadow } : undefined
          }
        >
          <Users className="size-3.5" />
          <span className="truncate">Team</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="space-y-4">
        <FeedList />
      </TabsContent>
      <TabsContent value="challenges" className="space-y-4">
        <GroupJoinCard />
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
