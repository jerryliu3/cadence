import { duoQueryKeys } from "./query-keys";

export interface DuoLifecycleApi {
  postJson: <TResponse, TBody = unknown>(
    path: string,
    body: TBody
  ) => Promise<TResponse>;
  deleteJson: <TResponse>(path: string) => Promise<TResponse>;
}

export interface DuoLifecycleQueryCoordinator {
  invalidateQueries: (input: { queryKey: readonly unknown[] }) => Promise<unknown>;
  refetchQueries: (input: {
    queryKey: readonly unknown[];
    type: "active" | "all" | "inactive";
  }) => Promise<unknown>;
}

async function refreshAfterLifecycleMutation({
  queryCoordinator,
  viewerUserId,
}: {
  queryCoordinator: DuoLifecycleQueryCoordinator;
  viewerUserId: string;
}) {
  await Promise.all([
    queryCoordinator.invalidateQueries({
      queryKey: duoQueryKeys.team(viewerUserId),
    }),
    queryCoordinator.invalidateQueries({
      queryKey: duoQueryKeys.progressPrefix(viewerUserId),
    }),
    queryCoordinator.invalidateQueries({
      queryKey: duoQueryKeys.insightsPrefix(viewerUserId),
    }),
    queryCoordinator.invalidateQueries({
      queryKey: duoQueryKeys.goalsPrefix(viewerUserId),
    }),
    queryCoordinator.invalidateQueries({
      queryKey: duoQueryKeys.plannerPrefix(viewerUserId),
    }),
    queryCoordinator.invalidateQueries({
      queryKey: duoQueryKeys.calendarOverlayPrefix(viewerUserId),
    }),
  ]);
  await queryCoordinator.refetchQueries({
    queryKey: duoQueryKeys.team(viewerUserId),
    type: "active",
  });
}

export function createDuoLifecycleMutations({
  api,
  queryCoordinator,
  viewerUserId,
}: {
  api: DuoLifecycleApi;
  queryCoordinator: DuoLifecycleQueryCoordinator;
  viewerUserId: string;
}) {
  return {
    async createInvite({
      partnerUsername,
      message,
    }: {
      partnerUsername: string;
      message?: string;
    }) {
      await api.postJson("/api/social/team/invites", {
        partnerUsername,
        message,
      });
      await refreshAfterLifecycleMutation({ queryCoordinator, viewerUserId });
    },
    async acceptIncomingInvite(teamId: string) {
      await api.postJson(`/api/social/team/invites/${teamId}/accept`, {
        visibilityAcknowledged: true,
      });
      await refreshAfterLifecycleMutation({ queryCoordinator, viewerUserId });
    },
    async declineIncomingInvite(teamId: string) {
      await api.postJson(`/api/social/team/invites/${teamId}/decline`, {});
      await refreshAfterLifecycleMutation({ queryCoordinator, viewerUserId });
    },
    async dissolveActiveTeam() {
      await api.deleteJson("/api/social/team");
      await refreshAfterLifecycleMutation({ queryCoordinator, viewerUserId });
    },
    async sendCheerToActivePartner(partnerId: string) {
      await api.postJson("/api/social/team/nudges", {
        toUserId: partnerId,
        kind: "cheer",
      });
      await refreshAfterLifecycleMutation({ queryCoordinator, viewerUserId });
    },
  };
}
