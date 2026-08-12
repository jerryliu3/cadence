import type { SocialFeedEvent } from "@/features/social/types";

interface SocialFeedResponse {
  schemaVersion: "1";
  items: SocialFeedEvent[];
  nextCursor: string | null;
}

export async function fetchSocialFeedPage({
  cursor,
  scope = "global",
  limit = 20,
}: {
  cursor?: string | null;
  scope?: "global" | "duo" | "actor";
  limit?: number;
}) {
  const params = new URLSearchParams();
  params.set("scope", scope);
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/social/feed?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    throw new Error(errorBody.message ?? errorBody.code ?? "Failed to load feed.");
  }

  return (await response.json()) as SocialFeedResponse;
}
