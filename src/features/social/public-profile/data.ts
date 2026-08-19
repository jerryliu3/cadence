import type { PublicProfileBundle } from "@cadence/shared/social/public-profile";
import { getApiErrorMessage, getJson } from "@/lib/api/client";
import {
  readTabDataCache,
  TAB_DATA_CACHE_TTL_MS,
  writeTabDataCache,
} from "@/lib/cache/tab-data-cache";

const PUBLIC_PROFILE_CACHE_PREFIX = "social:public-profile";
const PUBLIC_PROFILE_REQUEST_TIMEOUT_MS = 15_000;

interface PublicProfileResponse {
  schemaVersion: "1";
  correlationId: string;
  item: PublicProfileBundle;
}

function buildPublicProfileCacheKey(subjectUserId: string, year?: number) {
  return `${PUBLIC_PROFILE_CACHE_PREFIX}:${subjectUserId}:${year ?? "current"}`;
}

export async function fetchPublicProfileBundle({
  subjectUserId,
  year,
  forceRefresh = false,
}: {
  subjectUserId: string;
  year?: number;
  forceRefresh?: boolean;
}) {
  const normalizedSubjectUserId = subjectUserId.trim();
  const cacheKey = buildPublicProfileCacheKey(normalizedSubjectUserId, year);
  if (!forceRefresh) {
    const cached = readTabDataCache<PublicProfileBundle>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const payload = await getJson<PublicProfileResponse>(
      `/api/social/profiles/${encodeURIComponent(normalizedSubjectUserId)}`,
      {
        query: year ? { year: String(year) } : undefined,
        timeoutMs: PUBLIC_PROFILE_REQUEST_TIMEOUT_MS,
      }
    );
    writeTabDataCache(cacheKey, payload.item, TAB_DATA_CACHE_TTL_MS);
    return payload.item;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, "Public profile could not be loaded.")
    );
  }
}
