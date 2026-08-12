export interface SocialFeedCursor {
  createdAt: string;
  id: string;
}

export function encodeSocialFeedCursor(cursor: SocialFeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSocialFeedCursor(value: string): SocialFeedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed social feed cursor.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== "string" ||
    typeof (parsed as { id?: unknown }).id !== "string"
  ) {
    throw new Error("Malformed social feed cursor.");
  }

  return {
    createdAt: (parsed as { createdAt: string }).createdAt,
    id: (parsed as { id: string }).id,
  };
}
