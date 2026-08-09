"use client";

import { useCallback, useRef } from "react";
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
  const mutationInFlightRef = useRef(false);
  const pendingGroupGoalIdRef = useRef<string | null>(null);

  const reloadSocialData = useCallback(
    async (refreshFailureMessage: string) => {
      try {
        await loadData();
        return true;
      } catch {
        toast.error(refreshFailureMessage);
        return false;
      }
    },
    [loadData]
  );

  const beginMutation = useCallback(() => {
    if (mutationInFlightRef.current) {
      return false;
    }
    mutationInFlightRef.current = true;
    setSaving(true);
    return true;
  }, [setSaving]);

  const endMutation = useCallback(() => {
    mutationInFlightRef.current = false;
    setSaving(false);
  }, [setSaving]);

  const saveProfile = useCallback(async () => {
    if (!userId) {
      return;
    }
    if (!beginMutation()) {
      return;
    }
    try {
      await updateProfile({
        username: profileDraft.username.trim().toLowerCase(),
        displayName: profileDraft.display_name.trim() || null,
        avatarUrl: profileDraft.avatar_url.trim() || null,
      });
      const refreshed = await reloadSocialData(
        "Profile saved, but refresh failed. Please refresh the page."
      );
      if (refreshed) {
        toast.success("Profile saved.");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Profile could not be saved."));
    } finally {
      endMutation();
    }
  }, [beginMutation, endMutation, profileDraft, reloadSocialData, userId]);

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

      if (!beginMutation()) {
        return;
      }
      try {
        const payload = await createGoalShares({
          goalIds: newGoalIds,
          sharedWithUserId: targetUserId,
        });
        setShareMenuOpen(false);
        const sharedCount = payload.sharedCount;
        const refreshed = await reloadSocialData(
          "Goals were shared, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success(
            sharedCount === 1 ? "Shared 1 goal." : `Shared ${sharedCount} goals.`
          );
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Goal sharing failed."));
      } finally {
        endMutation();
      }
    },
    [
      activeSelectedShareGoalIds,
      beginMutation,
      endMutation,
      outgoingShares,
      reloadSocialData,
      setShareMenuOpen,
    ]
  );

  const revokeGoalShare = useCallback(
    async (goalId: string, sharedWithUserId: string) => {
      if (!beginMutation()) {
        return;
      }
      try {
        await deleteGoalShare({ goalId, sharedWithUserId });
        const refreshed = await reloadSocialData(
          "Access was removed, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success("Removed access.");
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Share removal failed."));
      } finally {
        endMutation();
      }
    },
    [beginMutation, endMutation, reloadSocialData]
  );

  const removeSharedGoalForMe = useCallback(
    async (goalId: string) => {
      if (!beginMutation()) {
        return;
      }
      try {
        await deleteGoalShare({
          goalId,
          sharedWithUserId: userId,
        });
        const refreshed = await reloadSocialData(
          "Removed from shared goals, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success("Removed from shared goals.");
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Share removal failed."));
      } finally {
        endMutation();
      }
    },
    [beginMutation, endMutation, reloadSocialData, userId]
  );

  const inviteToGroupGoal = useCallback(
    async (targetUserId: string) => {
      if (!selectedGroupGoalId) {
        toast.error("Choose a group goal first.");
        return;
      }

      if (!beginMutation()) {
        return;
      }
      try {
        await addGoalParticipant({
          goalId: selectedGroupGoalId,
          userId: targetUserId,
          role: "participant",
        });
        const refreshed = await reloadSocialData(
          "Participant invited, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success("Participant invited.");
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Participant invite failed."));
      } finally {
        endMutation();
      }
    },
    [beginMutation, endMutation, reloadSocialData, selectedGroupGoalId]
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

    if (!beginMutation()) {
      return;
    }
    if (!pendingGroupGoalIdRef.current) {
      pendingGroupGoalIdRef.current = crypto.randomUUID();
    }
    const newGroupGoalId = pendingGroupGoalIdRef.current;
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
      const refreshed = await reloadSocialData(
        "Group goal created, but refresh failed. Please refresh the page."
      );
      if (refreshed) {
        pendingGroupGoalIdRef.current = null;
        resetGroupDraft();
        toast.success("Group goal created.");
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create group goal."));
    } finally {
      endMutation();
    }
  }, [
    beginMutation,
    endMutation,
    groupDefinitionTargetCount,
    groupDraft,
    reloadSocialData,
    parsedGroupTargetCount,
    resetGroupDraft,
  ]);

  const removeParticipant = useCallback(
    async (goalId: string, participantUserId: string) => {
      if (!beginMutation()) {
        return;
      }
      try {
        await removeGoalParticipant({ goalId, userId: participantUserId });
        const refreshed = await reloadSocialData(
          "Participant removed, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success("Participant removed.");
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Participant removal failed."));
      } finally {
        endMutation();
      }
    },
    [beginMutation, endMutation, reloadSocialData]
  );

  const leaveGroup = useCallback(
    async (goalId: string) => {
      if (!beginMutation()) {
        return;
      }
      try {
        await removeGoalParticipant({ goalId, userId });
        const refreshed = await reloadSocialData(
          "You left the group goal, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success("You left the group goal.");
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Could not leave group goal."));
      } finally {
        endMutation();
      }
    },
    [beginMutation, endMutation, reloadSocialData, userId]
  );

  const deleteGroupGoalMutation = useCallback(
    async (goalId: string) => {
      if (!beginMutation()) {
        return;
      }
      try {
        await updateGoal({
          goalId,
          updates: { is_deleted: true },
        });
        const refreshed = await reloadSocialData(
          "Group goal deleted, but refresh failed. Please refresh the page."
        );
        if (refreshed) {
          toast.success("Group goal deleted.");
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Group goal could not be deleted."));
      } finally {
        endMutation();
      }
    },
    [beginMutation, endMutation, reloadSocialData]
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
