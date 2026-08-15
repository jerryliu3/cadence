import type { Database } from "@cadence/shared/supabase/database.types";

export type DuoPartnerSearchResult =
  Database["public"]["Functions"]["find_profile_by_username"]["Returns"][number];

interface DuoPartnerSearchClient {
  rpc(
    name: "find_profile_by_username",
    args: { p_query: string; p_limit: number }
  ): PromiseLike<{
    data: DuoPartnerSearchResult[] | null;
    error: { message: string } | null;
  }>;
}

export async function searchDuoPartners({
  client,
  query,
  viewerUserId,
}: {
  client: DuoPartnerSearchClient;
  query: string;
  viewerUserId: string;
}) {
  const normalizedUsername = query.trim().replace(/^@/, "").toLowerCase();
  if (!normalizedUsername) {
    return [];
  }
  const { data, error } = await client.rpc("find_profile_by_username", {
    p_query: normalizedUsername,
    p_limit: 10,
  });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).filter((profile) => profile.id !== viewerUserId);
}

export function buildDuoInviteInput({
  selectedProfile,
  viewerUserId,
  message,
}: {
  selectedProfile: DuoPartnerSearchResult | null;
  viewerUserId: string;
  message: string;
}) {
  if (!selectedProfile || selectedProfile.id === viewerUserId) {
    throw new Error("Select another Cadence user to invite.");
  }
  return {
    partnerId: selectedProfile.id,
    message: message.trim() || undefined,
  };
}
