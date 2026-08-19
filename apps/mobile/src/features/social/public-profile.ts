import { getApiErrorMessage } from "@cadence/shared/api-client";
import type { PublicProfileBundle } from "@cadence/shared/social/public-profile";
import { api } from "../../lib/api";

interface PublicProfileResponse {
  schemaVersion: "1";
  correlationId: string;
  item: PublicProfileBundle;
}

export async function fetchMobilePublicProfile({
  subjectUserId,
  year,
}: {
  subjectUserId: string;
  year?: number;
}) {
  const normalizedSubjectUserId = subjectUserId.trim();
  try {
    const response = await api.getJson<PublicProfileResponse>(
      `/api/social/profiles/${encodeURIComponent(normalizedSubjectUserId)}`,
      {
        query: year ? { year: String(year) } : undefined,
      }
    );
    return response.item;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, "Public profile could not be loaded.")
    );
  }
}
