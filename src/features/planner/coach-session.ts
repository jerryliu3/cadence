import type { CoachMessage } from "@/features/planner/calendar-surface.types";

export const COACH_SESSION_MAX_MESSAGES = 20;
export const COACH_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function buildCoachSessionKey(scopeMonth: string, timezone: string) {
  return `planner-coach-session:v1:${scopeMonth}:${timezone}`;
}

export function loadCoachSession(
  scopeMonth: string,
  timezone: string
): CoachMessage[] {
  try {
    const raw = sessionStorage.getItem(buildCoachSessionKey(scopeMonth, timezone));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as
      | { expiresAt: number; messages: CoachMessage[] }
      | null;
    if (!parsed || parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(buildCoachSessionKey(scopeMonth, timezone));
      return [];
    }
    return parsed.messages.slice(-COACH_SESSION_MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveCoachSession(
  scopeMonth: string,
  timezone: string,
  messages: CoachMessage[]
) {
  try {
    const payload = {
      expiresAt: Date.now() + COACH_SESSION_TTL_MS,
      messages: messages.slice(-COACH_SESSION_MAX_MESSAGES),
    };
    sessionStorage.setItem(
      buildCoachSessionKey(scopeMonth, timezone),
      JSON.stringify(payload)
    );
  } catch {
    // Ignore storage failures (private mode/quota) and keep in-memory state.
  }
}

