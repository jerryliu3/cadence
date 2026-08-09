import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultGroupDraft,
  useSocialMutations,
  type GroupGoalDraft,
} from "@/features/social/use-social-mutations";
import type { GoalShare } from "@/lib/goals/types";

const createGoalMock = vi.fn();
const createGoalSharesMock = vi.fn();
const updateProfileMock = vi.fn();
const removeGoalParticipantMock = vi.fn();
const addGoalParticipantMock = vi.fn();
const deleteGoalShareMock = vi.fn();
const updateGoalMock = vi.fn();

const toastMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/api/goals-social-client", () => ({
  createGoal: (...args: unknown[]) => createGoalMock(...args),
  createGoalShares: (...args: unknown[]) => createGoalSharesMock(...args),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
  removeGoalParticipant: (...args: unknown[]) => removeGoalParticipantMock(...args),
  addGoalParticipant: (...args: unknown[]) => addGoalParticipantMock(...args),
  deleteGoalShare: (...args: unknown[]) => deleteGoalShareMock(...args),
  updateGoal: (...args: unknown[]) => updateGoalMock(...args),
}));

vi.mock("sonner", () => {
  const toast = ((...args: unknown[]) => toastMock(...args)) as ((
    ...args: unknown[]
  ) => void) & {
    success: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  toast.success = (...args: unknown[]) => toastSuccessMock(...args);
  toast.error = (...args: unknown[]) => toastErrorMock(...args);
  return { toast };
});

function buildGoalShare(overrides: Partial<GoalShare> = {}): GoalShare {
  return {
    id: "share-1",
    goal_id: "goal-1",
    shared_with: "user-2",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildGroupDraft(overrides: Partial<GroupGoalDraft> = {}): GroupGoalDraft {
  return {
    ...createDefaultGroupDraft(),
    title: "Team sprint",
    categorySelection: "personal",
    frequencyType: "recurring",
    recurrenceInterval: "weekly",
    targetCount: "",
    ...overrides,
  };
}

function createHookArgs(overrides: Partial<Parameters<typeof useSocialMutations>[0]> = {}) {
  const loadData = vi.fn().mockResolvedValue(undefined);
  const setSaving = vi.fn();
  const setShareMenuOpen = vi.fn();
  const resetGroupDraft = vi.fn();
  const baseArgs: Parameters<typeof useSocialMutations>[0] = {
    userId: "owner-1",
    profileDraft: {
      username: "Jane",
      display_name: "Jane Doe",
      avatar_url: "",
    },
    outgoingShares: [],
    activeSelectedShareGoalIds: [],
    selectedGroupGoalId: "",
    groupDraft: buildGroupDraft(),
    parsedGroupTargetCount: null,
    groupDefinitionTargetCount: null,
    loadData,
    setSaving,
    setShareMenuOpen,
    resetGroupDraft,
  };
  return {
    ...baseArgs,
    ...overrides,
    loadData: overrides.loadData ?? loadData,
    setSaving: overrides.setSaving ?? setSaving,
    setShareMenuOpen: overrides.setShareMenuOpen ?? setShareMenuOpen,
    resetGroupDraft: overrides.resetGroupDraft ?? resetGroupDraft,
  };
}

describe("useSocialMutations", () => {
  beforeEach(() => {
    createGoalMock.mockReset().mockResolvedValue({ goalId: "goal-new" });
    createGoalSharesMock.mockReset().mockResolvedValue({ sharedCount: 1 });
    updateProfileMock.mockReset().mockResolvedValue({ success: true });
    removeGoalParticipantMock.mockReset().mockResolvedValue({ success: true });
    addGoalParticipantMock.mockReset().mockResolvedValue({ success: true });
    deleteGoalShareMock.mockReset().mockResolvedValue({ success: true });
    updateGoalMock.mockReset().mockResolvedValue({ goalId: "goal-1" });
    toastMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("shares only goals not already shared with the target user", async () => {
    const args = createHookArgs({
      activeSelectedShareGoalIds: ["goal-1", "goal-2"],
      outgoingShares: [
        buildGoalShare({
          goal_id: "goal-1",
          shared_with: "user-2",
        }),
      ],
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.shareGoalWithUser("user-2");
    });

    expect(createGoalSharesMock).toHaveBeenCalledWith({
      goalIds: ["goal-2"],
      sharedWithUserId: "user-2",
    });
    expect(args.setShareMenuOpen).toHaveBeenCalledWith(false);
    expect(args.loadData).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Shared 1 goal.");
  });

  it("short-circuits share workflow when all selected goals are already shared", async () => {
    const args = createHookArgs({
      activeSelectedShareGoalIds: ["goal-1"],
      outgoingShares: [
        buildGoalShare({
          goal_id: "goal-1",
          shared_with: "user-2",
        }),
      ],
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.shareGoalWithUser("user-2");
    });

    expect(createGoalSharesMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      "All selected goals are already shared with this user."
    );
  });

  it("validates required group goal title before attempting mutation", async () => {
    const args = createHookArgs({
      groupDraft: buildGroupDraft({ title: "   " }),
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.createGroupGoal();
    });

    expect(createGoalMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Group goal title is required.");
    expect(args.setSaving).not.toHaveBeenCalled();
  });

  it("creates group goals through API and resets state on success", async () => {
    const args = createHookArgs({
      groupDraft: buildGroupDraft({
        title: "Read docs",
        description: "Weekly deep work",
      }),
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.createGroupGoal();
    });

    expect(createGoalMock).toHaveBeenCalledTimes(1);
    expect(createGoalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        addOwnerParticipant: true,
        goal: expect.objectContaining({
          title: "Read docs",
          description: "Weekly deep work",
          is_group: true,
        }),
      })
    );
    expect(args.setSaving).toHaveBeenNthCalledWith(1, true);
    expect(args.resetGroupDraft).toHaveBeenCalledTimes(1);
    expect(args.loadData).toHaveBeenCalledTimes(1);
    expect(args.setSaving).toHaveBeenLastCalledWith(false);
    expect(toastSuccessMock).toHaveBeenCalledWith("Group goal created.");
  });

  it("maps fixed-milestone target_count payload correctly", async () => {
    const args = createHookArgs({
      groupDraft: buildGroupDraft({
        title: "Milestone goal",
        frequencyType: "fixed_milestones",
        targetCount: "4",
        endDate: "2026-12-31",
      }),
      parsedGroupTargetCount: 4,
      groupDefinitionTargetCount: 4,
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.createGroupGoal();
    });

    expect(createGoalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.objectContaining({
          frequency_type: "fixed_milestones",
          target_count: 4,
          recurrence_interval: null,
        }),
      })
    );
  });

  it("uses API sharedCount for share success messaging", async () => {
    createGoalSharesMock.mockResolvedValueOnce({ sharedCount: 2 });
    const args = createHookArgs({
      activeSelectedShareGoalIds: ["goal-1", "goal-2", "goal-3"],
      outgoingShares: [buildGoalShare({ goal_id: "goal-1", shared_with: "user-2" })],
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.shareGoalWithUser("user-2");
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Shared 2 goals.");
  });

  it("keeps saving state balanced when profile save fails", async () => {
    updateProfileMock.mockRejectedValueOnce(new Error("save failed"));
    const args = createHookArgs();
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.saveProfile();
    });

    expect(args.setSaving).toHaveBeenNthCalledWith(1, true);
    expect(args.setSaving).toHaveBeenLastCalledWith(false);
    expect(toastErrorMock).toHaveBeenCalledWith("save failed");
  });

  it("shows refresh-specific copy when profile write succeeds but refresh fails", async () => {
    const args = createHookArgs({
      loadData: vi.fn().mockRejectedValue(new Error("refresh failed")),
    });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.saveProfile();
    });

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Profile saved, but refresh failed. Please refresh the page."
    );
    expect(args.setSaving).toHaveBeenLastCalledWith(false);
  });

  it("invites participants through the API route", async () => {
    const args = createHookArgs({ selectedGroupGoalId: "goal-1" });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.inviteToGroupGoal("user-2");
    });

    expect(addGoalParticipantMock).toHaveBeenCalledWith({
      goalId: "goal-1",
      userId: "user-2",
      role: "participant",
    });
  });

  it("removes a share via route-backed client", async () => {
    const args = createHookArgs();
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.revokeGoalShare("goal-2", "user-3");
    });

    expect(deleteGoalShareMock).toHaveBeenCalledWith({
      goalId: "goal-2",
      sharedWithUserId: "user-3",
    });
  });

  it("removes the current user from shared goals with own id", async () => {
    const args = createHookArgs({ userId: "owner-1" });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.removeSharedGoalForMe("goal-2");
    });

    expect(deleteGoalShareMock).toHaveBeenCalledWith({
      goalId: "goal-2",
      sharedWithUserId: "owner-1",
    });
  });

  it("removes arbitrary participants with provided user id", async () => {
    const args = createHookArgs();
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.removeParticipant("goal-7", "user-11");
    });

    expect(removeGoalParticipantMock).toHaveBeenCalledWith({
      goalId: "goal-7",
      userId: "user-11",
    });
  });

  it("uses authenticated user id when leaving a group", async () => {
    const args = createHookArgs({ userId: "owner-1" });
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.leaveGroup("goal-9");
    });

    expect(removeGoalParticipantMock).toHaveBeenCalledWith({
      goalId: "goal-9",
      userId: "owner-1",
    });
  });

  it("soft-deletes group goals via updateGoal", async () => {
    const args = createHookArgs();
    const { result } = renderHook(() => useSocialMutations(args));

    await act(async () => {
      await result.current.deleteGroupGoal("goal-12");
    });

    expect(updateGoalMock).toHaveBeenCalledWith({
      goalId: "goal-12",
      updates: { is_deleted: true },
    });
  });
});
