import { describe, expect, it } from "vitest";
import {
  createCalendarFeedToken,
  readCalendarFeedTokenUserId,
  verifyCalendarFeedToken,
} from "@/lib/integrations/calendar/feed-token";

const userId = "11111111-1111-4111-8111-111111111111";
const hmacKey = "test-calendar-feed-hmac-key-1234567890";

describe("calendar feed token", () => {
  it("round-trips user id with matching version", () => {
    const token = createCalendarFeedToken({
      userId,
      version: 3,
      hmacKey,
    });
    expect(readCalendarFeedTokenUserId(token)).toBe(userId);
    expect(
      verifyCalendarFeedToken({
        token,
        version: 3,
        hmacKey,
      })
    ).toBe(userId);
  });

  it("rejects tampered token signatures", () => {
    const token = createCalendarFeedToken({
      userId,
      version: 3,
      hmacKey,
    });
    const tampered = `${token.slice(0, -1)}A`;
    expect(
      verifyCalendarFeedToken({
        token: tampered,
        version: 3,
        hmacKey,
      })
    ).toBeNull();
  });

  it("invalidates old tokens after version bump", () => {
    const token = createCalendarFeedToken({
      userId,
      version: 1,
      hmacKey,
    });
    expect(
      verifyCalendarFeedToken({
        token,
        version: 2,
        hmacKey,
      })
    ).toBeNull();
  });
});
