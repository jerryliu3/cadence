import { canonicalHash } from "./canonical";

export function buildPlannerConfirmationHash({
  previewHash,
  issueCodes,
}: {
  previewHash: string;
  issueCodes: string[];
}) {
  return canonicalHash({
    previewHash,
    issueCodes: [...issueCodes].sort(),
  });
}
