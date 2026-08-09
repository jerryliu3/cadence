"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api/client";
import {
  addGoalParticipant,
  createGoal,
  createGoalShares,
  deleteGoalShare,
  removeGoalParticipant,
  updateGoal,
  updateProfile,
} from "@/lib/api/goals-social-client";
import {
  type CategorySelection,
  getCategoryLabel,
} from "@/lib/goals/category";
import {
  isOrdinalGoalDefinition,
  validateGoalDefinition,
} from "@/lib/goals/definition-validation";
import type {
  GoalFrequencyType,
  GoalShare,
  RecurrenceInterval,
} from "@/lib/goals/types";
import { toLocalDateString } from "@/lib/dates/day";

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

export function createDefaultGroupDraft(): GroupGoalDraft {
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

interface UseSocialMutationsParams {
  userId: string;
  profileDraft: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
  outgoingShares: GoalShare[];
  activeSelectedShareGoalIds: string[];
  selectedGroupGoalId: string;
  groupDraft: GroupGoalDraft;
  parsedGroupTargetCount: number | null;
  groupDefinitionTargetCount: number | null;
  loadData: () => Promise<void>;
  setSaving: (value: boolean) => void;
  setShareMenuOpen: (value: boolean) => void;
  resetGroupDraft: () => void;
}

export function useSocialMutations({
  userId,
  profileDraft,
  outgoingShares,
  activeSelectedShareGoalIds,
  selectedGroupGoalId,
  groupDraft,
  parsedGroupTargetCount,
  groupDefinitionTargetCount,
  loadData,
  setSaving,
  setShareMenuOpen,
  resetGroupDraft,
}: UseSocialMutationsParams) {
  const saveProfile = useCallback(async () => {
    if (!userId) {
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        username: profileDraft.username.trim().toLowerCase(),
        displayName: profileDraft.display_name.trim() || null,
        avatarUrl: profileDraft.avatar_url.trim() || null,
      });
      toast.success("Profile saved.");
      await loadData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Profile could not be saved."));
    } finally {
      setSaving(false);
    }
  }, [loadData, profileDraft, setSaving, userId]);

  const shareGoalWithUser = useCallback(
    async (targetUserId: string) => {
      if (activeSelectedShareGoalIds.length === 0) {
        toast.error("Select at least one goal to share.");
        return;
      }

      const existingGoalIds = new Set(
        outgoingShares
          .filter((entry) => entry.shared_with === targetUserId)
          .map((entry) => entry.goal_id)
      );
      const newGoalIds = activeSelectedShareGoalIds.filter(
        (goalId) => !existingGoalIds.has(goalId)
      );

      if (newGoalIds.length === 0) {
        toast("All selected goals are already shared with this user.");
        return;
      }

      try {
        await createGoalShares({
          goalIds: newGoalIds,
          sharedWithUserId: targetUserId,
        });
        toast.success(
          newGoalIds.length === 1
            ? "Shared 1 goal."
            : `Shared ${newGoalIds.length} goals.`
        );
        setShareMenuOpen(false);
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Goal sharing failed."));
      }
    },
    [activeSelectedShareGoalIds, loadData, outgoingShares, setShareMenuOpen]
  );

  const revokeGoalShare = useCallback(
    async (goalId: string, sharedWithUserId: string) => {
      try {
        await deleteGoalShare({ goalId, sharedWithUserId });
        toast.success("Removed access.");
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Share removal failed."));
      }
    },
    [loadData]
  );

  const removeSharedGoalForMe = useCallback(
    async (goalId: string) => {
      try {
        await deleteGoalShare({
          goalId,
          sharedWithUserId: userId,
        });
        toast.success("Removed from shared goals.");
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Share removal failed."));
      }
    },
    [loadData, userId]
  );

  const inviteToGroupGoal = useCallback(
    async (targetUserId: string) => {
      if (!selectedGroupGoalId) {
        toast.error("Choose a group goal first.");
        return;
      }

      try {
        await addGoalParticipant({
          goalId: selectedGroupGoalId,
          userId: targetUserId,
          role: "participant",
        });
        toast.success("Participant invited.");
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Participant invite failed."));
      }
    },
    [loadData, selectedGroupGoalId]
  );

  const createGroupGoalMutation = useCallback(async () => {
    if (!groupDraft.title.trim()) {
      toast.error("Group goal title is required.");
      return;
    }

    if (!groupDraft.startDate) {
      toast.error("Start date is required.");
      return;
    }

    if (
      groupDraft.categorySelection === "custom" &&
      groupDraft.customCategory.trim().length === 0
    ) {
      toast.error("Custom category name is required.");
      return;
    }

    if (
      groupDraft.frequencyType === "fixed_milestones" &&
      parsedGroupTargetCount === null
    ) {
      toast.error("Milestone group goals need a positive target.");
      return;
    }

    const definitionIssues = validateGoalDefinition({
      frequencyType: groupDraft.frequencyType,
      targetCount: groupDefinitionTargetCount,
      startDate: groupDraft.startDate,
      endDate: groupDraft.endDate || null,
    });
    if (definitionIssues.length > 0) {
      toast.error(definitionIssues[0]!.message);
      return;
    }

    setSaving(true);
    const newGroupGoalId = crypto.randomUUID();
    try {
      await createGoal({
        addOwnerParticipant: true,
        goal: {
          id: newGroupGoalId,
          title: groupDraft.title.trim(),
          description: groupDraft.description.trim() || null,
          category: getCategoryLabel(
            groupDraft.categorySelection,
            groupDraft.customCategory
          ),
          color: "#0ea5e9",
          frequency_type: groupDraft.frequencyType,
          recurrence_interval:
            groupDraft.frequencyType === "recurring"
              ? groupDraft.recurrenceInterval
              : null,
          target_count:
            groupDraft.frequencyType === "fixed_milestones"
              ? parsedGroupTargetCount
              : groupDraft.frequencyType === "recurring" &&
                  groupDraft.targetCount.trim().length > 0
                ? parsedGroupTargetCount
              : null,
          start_date: groupDraft.startDate,
          end_date: groupDraft.endDate || null,
          default_local_time: null,
          is_group: true,
          is_deleted: false,
          milestone_names: null,
        },
      });
      toast.success("Group goal created.");
      resetGroupDraft();
      await loadData();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create group goal."));
    } finally {
      setSaving(false);
    }
  }, [
    groupDefinitionTargetCount,
    groupDraft,
    loadData,
    parsedGroupTargetCount,
    resetGroupDraft,
    setSaving,
  ]);

  const removeParticipant = useCallback(
    async (goalId: string, participantUserId: string) => {
      try {
        await removeGoalParticipant({ goalId, userId: participantUserId });
        toast.success("Participant removed.");
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Participant removal failed."));
      }
    },
    [loadData]
  );

  const leaveGroup = useCallback(
    async (goalId: string) => {
      try {
        await removeGoalParticipant({ goalId, userId });
        toast.success("You left the group goal.");
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Could not leave group goal."));
      }
    },
    [loadData, userId]
  );

  const deleteGroupGoalMutation = useCallback(
    async (goalId: string) => {
      try {
        await updateGoal({
          goalId,
          updates: { is_deleted: true },
        });
        toast.success("Group goal deleted.");
        await loadData();
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Group goal could not be deleted."));
      }
    },
    [loadData]
  );

  return {
    saveProfile,
    shareGoalWithUser,
    revokeGoalShare,
    removeSharedGoalForMe,
    inviteToGroupGoal,
    createGroupGoal: createGroupGoalMutation,
    removeParticipant,
    leaveGroup,
    deleteGroupGoal: deleteGroupGoalMutation,
  };
}
