import { toLocalDateString } from "@/lib/dates/day";
import type {
  Goal,
  GoalFrequencyType,
  GoalParticipant,
  GoalShare,
  Profile,
  RecurrenceInterval,
  Completion,
} from "@/lib/goals/types";
import type { CategorySelection } from "@/lib/goals/category";

export interface SocialState {
  userId: string;
  profile: Profile | null;
  ownGoals: Goal[];
  sharedGoals: Goal[];
  sharedEntries: GoalShare[];
  outgoingShares: GoalShare[];
  sharedOwners: Record<string, Profile>;
  groupGoals: Goal[];
  participants: GoalParticipant[];
  completions: Completion[];
  profileDirectory: Record<string, Profile>;
}

export interface ShareMenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export interface GroupGoalDraft {
  title: string;
  description: string;
  categorySelection: CategorySelection;
  customCategory: string;
  frequencyType: GoalFrequencyType;
  recurrenceInterval: RecurrenceInterval;
  targetCount: string;
  startDate: string;
  endDate: string;
}

export const initialSocialState: SocialState = {
  userId: "",
  profile: null,
  ownGoals: [],
  sharedGoals: [],
  sharedEntries: [],
  outgoingShares: [],
  sharedOwners: {},
  groupGoals: [],
  participants: [],
  completions: [],
  profileDirectory: {},
};

export function createDefaultGroupGoalDraft(): GroupGoalDraft {
  return {
    title: "",
    description: "",
    categorySelection: "personal",
    customCategory: "",
    frequencyType: "recurring",
    recurrenceInterval: "weekly",
    targetCount: "",
    startDate: toLocalDateString(),
    endDate: "",
  };
}

export function getProfileInitials(profile: Profile | null) {
  if (!profile) {
    return "??";
  }
  return (profile.display_name ?? profile.username).slice(0, 2).toUpperCase();
}
