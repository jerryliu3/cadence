export type PlannerLinkRole = "none" | "source" | "target";

export interface PlannerLinkRoleInput {
  sourceGoalId: string;
  targetGoalId: string;
}

export function resolveGoalLinkRole(
  goalId: string,
  links: readonly PlannerLinkRoleInput[]
): PlannerLinkRole {
  if (links.some((link) => link.targetGoalId === goalId)) {
    return "target";
  }
  if (links.some((link) => link.sourceGoalId === goalId)) {
    return "source";
  }
  return "none";
}
