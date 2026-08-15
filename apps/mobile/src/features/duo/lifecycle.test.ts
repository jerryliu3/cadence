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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
      partnerUsername: "partner_user",
      message: "hi",
    });
    await mutation.acceptIncomingInvite("22222222-2222-4222-8222-222222222222");
    await mutation.declineIncomingInvite("33333333-3333-4333-8333-333333333333");
    await mutation.dissolveActiveTeam();
    await mutation.sendCheerToActivePartner("44444444-4444-4444-8444-444444444444");

    expect(api.postJson).toHaveBeenCalledWith("/api/social/team/invites", {
      partnerUsername: "partner_user",
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
    expect(queryCoordinator.invalidateQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.calendarOverlayPrefix("viewer-1"),
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
        partnerUsername: "partner_user",
      })
    ).rejects.toThrow("boom");

    expect(queryCoordinator.invalidateQueries).not.toHaveBeenCalled();
    expect(queryCoordinator.refetchQueries).not.toHaveBeenCalled();
  });

  it("waits for invalidations before team refetch", async () => {
    const api = createApiMock();
    const firstInvalidation = createDeferred<unknown>();
    const queryCoordinator: DuoLifecycleQueryCoordinator = {
      invalidateQueries: vi
        .fn()
        .mockImplementationOnce(() => firstInvalidation.promise)
        .mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
    };
    const mutation = createDuoLifecycleMutations({
      api,
      queryCoordinator,
      viewerUserId: "viewer-1",
    });

    const pending = mutation.dissolveActiveTeam();
    await Promise.resolve();
    expect(queryCoordinator.refetchQueries).not.toHaveBeenCalled();

    firstInvalidation.resolve(undefined);
    await pending;

    expect(queryCoordinator.refetchQueries).toHaveBeenCalledWith({
      queryKey: duoQueryKeys.team("viewer-1"),
      type: "active",
    });
  });
});
