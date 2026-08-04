export type PlannerErrorCode =
  | "validation_failed"
  | "plan_too_large"
  | "invariant_failed";

export class PlannerError extends Error {
  constructor(
    readonly code: PlannerErrorCode,
    readonly httpStatus: number,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PlannerError";
  }
}
