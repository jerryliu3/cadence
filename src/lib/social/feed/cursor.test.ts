import { describe, expect, it } from "vitest";
import { decodeSocialFeedCursor, encodeSocialFeedCursor } from "@/lib/social/feed/cursor";

describe("social feed cursor", () => {
  it("encodes and decodes cursor payloads", () => {
    const encoded = encodeSocialFeedCursor({
      createdAt: "2026-08-09T20:30:00.000Z",
      id: "8b000000-0000-4000-8000-000000000001",
    });

    expect(decodeSocialFeedCursor(encoded)).toEqual({
      createdAt: "2026-08-09T20:30:00.000Z",
      id: "8b000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeSocialFeedCursor("not-base64")).toThrow(
      "Malformed social feed cursor."
    );
  });
});
