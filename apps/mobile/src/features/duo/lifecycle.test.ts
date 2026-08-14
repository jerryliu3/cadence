import { describe, expect, it, vi } from "vitest";
import {
  createDuoLifecycleMutations,
  type DuoLifecycleApi,
  type DuoLifecycleQueryCoordinator,
} from "./lifecycle";
import { duoQueryKeys } from "./query-keys";

function createApiMock(): DuoLifecycleApi {
  return {
    postJson: vi.fn().mockResolvedValue({}),
    deleteJson: vi.fn().mockResolvedValue({}),
  };
}

function createQueryCoordinatorMock(): DuoLifecycleQueryCoordinator {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createDuoLifecycleMutations", () => {
  it("sends expected payloads and invalidates user-scoped prefixes", async () => {
    const api = createApiMock();
    const queryCoordinator = createQueryCoordinatorMock();
    const mutation = createDuoLifecycleMutations({
      api,
      queryCoordinator,
      viewerUserId: "viewer-1",
    });

    await mutation.createInvite({
      partnerId: "11111111-1111-4111-8111-111111111111",
      message: "hi",
    });
    await mutation.acceptIncomingInvite("22222222-2222-4222-8222-222222222222");
    await mutation.declineIncomingInvite("33333333-3333-4333-8333-333333333333");
    await mutation.dissolveActiveTeam();
    await mutation.sendCheerToActivePartner("44444444-4444-4444-8444-444444444444");

    expect(api.postJson).toHaveBeenCalledWith("/api/social/team/invites", {
      partnerId: "11111111-1111-4111-8111-111111111111",
      message: "hi",
    });
    expect(api.postJson).toHaveBeenCalledWith(
      "/api/social/team/invites/22222222-2222-4222-8222-222222222222/accept",
      { visibilityAcknowledged: true }
    );
    expect(api.postJson).toHaveBeenCalledWith(
      "/api/social/team/invites/33333333-3333-4333-8333-333333333333/decline",
      {}
    );
    expect(api.deleteJson).toHaveBeenCalledWith("/api/social/team");
    expect(api.postJson).toHaveBeenCalledWith("/api/social/team/nudges", {
      toUserId: "44444444-4444-4444-8444-444444444444",
      kind: "cheer",
    });

    expect(queryCoordinator.invalidateQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.team("viewer-1"),
    });
    expect(queryCoordinator.invalidateQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.progressPrefix("viewer-1"),
    });
    expect(queryCoordinator.invalidateQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.insightsPrefix("viewer-1"),
    });
    expect(queryCoordinator.invalidateQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.goalsPrefix("viewer-1"),
    });
    expect(queryCoordinator.invalidateQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.plannerPrefix("viewer-1"),
    });

    expect(queryCoordinator.refetchQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.team("viewer-1"),
      type: "active",
    });
  });

  it("does not invalidate or refetch if the mutation call fails", async () => {
    const api = createApiMock();
    const queryCoordinator = createQueryCoordinatorMock();
    const mutation = createDuoLifecycleMutations({
      api,
      queryCoordinator,
      viewerUserId: "viewer-1",
    });

    vi.mocked(api.postJson).mockRejectedValueOnce(new Error("boom"));

    await expect(
      mutation.createInvite({
        partnerId: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toThrow("boom");

    expect(queryCoordinator.invalidateQueries).not.toHaveBeenCalled();
    expect(queryCoordinator.refetchQueries).not.toHaveBeenCalled();
  });
});
