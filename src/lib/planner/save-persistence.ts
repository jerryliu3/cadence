import type { PlannerDraftCommand } from "@/lib/planner/draft-commands";
import type { PlannerPolicy } from "@/lib/planner/policy";

export function shouldUseDirectDraftPersistence({
  draftCommands,
  requestedPolicy,
}: {
  draftCommands: PlannerDraftCommand[];
  requestedPolicy: PlannerPolicy | null;
}) {
  return draftCommands.length > 0 && requestedPolicy === null;
}
