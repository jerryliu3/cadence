import { getApiErrorMessage } from "@cadence/shared/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { LoadingScreen, Screen } from "../../ui/screen";
import { useDuo } from "../duo/DuoProvider";
import { createDuoLifecycleMutations } from "../duo/lifecycle";
import {
  buildDuoInviteInput,
  searchDuoPartners,
  type DuoPartnerSearchResult,
} from "./duo-onboarding";

export function SocialScreen() {
  const theme = useTheme();
  const { userId } = useSession();
  const duo = useDuo();
  const queryClient = useQueryClient();
  const [partnerSearchInput, setPartnerSearchInput] = useState("");
  const [partnerSearchResults, setPartnerSearchResults] = useState<
    DuoPartnerSearchResult[]
  >([]);
  const [selectedPartner, setSelectedPartner] =
    useState<DuoPartnerSearchResult | null>(null);
  const [inviteMessageInput, setInviteMessageInput] = useState("");
  const [visibilityAcknowledged, setVisibilityAcknowledged] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const viewerProfile = useQuery({
    queryKey: ["mobile-social-viewer-profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId ?? "")
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data?.username ?? null;
    },
  });

  const lifecycle = useMemo(() => {
    if (!userId) {
      return null;
    }
    return createDuoLifecycleMutations({
      api,
      queryCoordinator: {
        invalidateQueries: (input) => queryClient.invalidateQueries(input),
        refetchQueries: (input) => queryClient.refetchQueries(input),
      },
      viewerUserId: userId,
    });
  }, [queryClient, userId]);

  const searchPartners = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("You must be signed in to find a partner.");
      }
      return searchDuoPartners({
        client: supabase,
        query: partnerSearchInput,
        viewerUserId: userId,
      });
    },
    onMutate: () => {
      setPartnerSearchResults([]);
      setSelectedPartner(null);
      setStatusMessage(null);
    },
    onSuccess: (results) => {
      setPartnerSearchResults(results);
      setStatusMessage(
        results.length === 0 ? "No matching Cadence users found." : null
      );
    },
    onError: (error) => {
      setPartnerSearchResults([]);
      setSelectedPartner(null);
      setStatusMessage(getApiErrorMessage(error, "Partner search failed."));
    },
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      if (!lifecycle) {
        throw new Error("You must be signed in to invite a partner.");
      }
      await lifecycle.createInvite(
        buildDuoInviteInput({
          selectedProfile: selectedPartner,
          viewerUserId: userId ?? "",
          message: inviteMessageInput,
        })
      );
    },
    onSuccess: () => {
      setPartnerSearchInput("");
      setPartnerSearchResults([]);
      setSelectedPartner(null);
      setInviteMessageInput("");
      setStatusMessage("Invite sent.");
    },
    onError: (error) => {
      setStatusMessage(getApiErrorMessage(error, "Could not send invite."));
    },
  });

  const acceptInvite = useMutation({
    mutationFn: async () => {
      if (!lifecycle) {
        throw new Error("You must be signed in to accept invites.");
      }
      const teamId = duo.state.pendingInvite?.teamId;
      if (!teamId) {
        throw new Error("No incoming invite is currently available.");
      }
      if (!visibilityAcknowledged) {
        throw new Error("Please acknowledge partner visibility before accepting.");
      }
      await lifecycle.acceptIncomingInvite(teamId);
    },
    onSuccess: () => {
      setVisibilityAcknowledged(false);
      setStatusMessage("Invite accepted.");
    },
    onError: (error) => {
      setStatusMessage(getApiErrorMessage(error, "Could not accept invite."));
    },
  });

  const declineInvite = useMutation({
    mutationFn: async () => {
      if (!lifecycle) {
        throw new Error("You must be signed in to decline invites.");
      }
      const teamId = duo.state.pendingInvite?.teamId;
      if (!teamId) {
        throw new Error("No incoming invite is currently available.");
      }
      await lifecycle.declineIncomingInvite(teamId);
    },
    onSuccess: () => {
      setVisibilityAcknowledged(false);
      setStatusMessage("Invite declined.");
    },
    onError: (error) => {
      setStatusMessage(getApiErrorMessage(error, "Could not decline invite."));
    },
  });

  const dissolveTeam = useMutation({
    mutationFn: async () => {
      if (!lifecycle) {
        throw new Error("You must be signed in to dissolve a team.");
      }
      await lifecycle.dissolveActiveTeam();
    },
    onSuccess: () => {
      setStatusMessage("Team dissolved.");
    },
    onError: (error) => {
      setStatusMessage(getApiErrorMessage(error, "Could not dissolve team."));
    },
  });

  const sendCheer = useMutation({
    mutationFn: async () => {
      if (!lifecycle) {
        throw new Error("You must be signed in to send cheers.");
      }
      const partnerId = duo.state.activePartner?.partnerId;
      if (!partnerId) {
        throw new Error("You need an active partner to send a cheer.");
      }
      await lifecycle.sendCheerToActivePartner(partnerId);
    },
    onSuccess: () => {
      setStatusMessage("Cheer sent.");
    },
    onError: (error) => {
      setStatusMessage(getApiErrorMessage(error, "Could not send cheer."));
    },
  });

  const busy =
    searchPartners.isPending ||
    createInvite.isPending ||
    acceptInvite.isPending ||
    declineInvite.isPending ||
    dissolveTeam.isPending ||
    sendCheer.isPending ||
    duo.teamRefreshing;

  if (!duo.socialEnabled) {
    return (
      <Screen title="Challenges">
        <Text style={{ color: theme.colors.mutedForeground }}>
          Social is disabled for this environment.
        </Text>
      </Screen>
    );
  }

  if (duo.teamLoading) {
    return <LoadingScreen />;
  }

  if (duo.availability === "unavailable") {
    return (
      <Screen title="Challenges">
        <Text style={{ color: theme.colors.destructive }}>
          Team status is temporarily unavailable. Retry to continue team actions.
        </Text>
        <PrimaryButton
          label={duo.teamRefreshing ? "Refreshing..." : "Retry team status"}
          disabled={duo.teamRefreshing}
          onPress={() => {
            void duo.refreshTeam();
          }}
        />
        {statusMessage ? (
          <Text style={{ color: theme.colors.mutedForeground }}>{statusMessage}</Text>
        ) : null}
      </Screen>
    );
  }

  const activePartner = duo.state.activePartner;
  const pendingInvite = duo.state.pendingInvite;
  const incomingInvite = pendingInvite?.isIncoming ? pendingInvite : null;
  const outgoingInvite = pendingInvite && !pendingInvite.isIncoming ? pendingInvite : null;
  const partnerLabel =
    activePartner?.partnerDisplayName ?? activePartner?.partnerUsername ?? "Partner";
  const pendingLabel =
    pendingInvite?.partnerDisplayName ?? pendingInvite?.partnerUsername ?? "Partner";

  return (
    <Screen title="Challenges">
      <View style={[styles.card, { borderColor: theme.colors.border }]}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Signed in as{" "}
          {viewerProfile.data ? `@${viewerProfile.data}` : "Cadence user"}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          User id: {userId}
        </Text>
      </View>
      {activePartner ? (
        <View style={[styles.card, { borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Active team with {partnerLabel}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Partner id: {activePartner.partnerId}
          </Text>
          <PrimaryButton
            label={sendCheer.isPending ? "Sending cheer..." : "Send cheer"}
            disabled={busy}
            onPress={() => {
              void sendCheer.mutateAsync();
            }}
          />
          <PrimaryButton
            label={dissolveTeam.isPending ? "Dissolving..." : "Dissolve team"}
            disabled={busy}
            onPress={() => {
              void dissolveTeam.mutateAsync();
            }}
          />
        </View>
      ) : incomingInvite ? (
        <View style={[styles.card, { borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Incoming invite from {pendingLabel}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Acknowledge visibility before accepting.
          </Text>
          <Pressable
            style={styles.ackRow}
            onPress={() => setVisibilityAcknowledged((value) => !value)}
            accessibilityRole="checkbox"
            accessibilityLabel="I understand partner progress visibility will be shared."
            accessibilityState={{ checked: visibilityAcknowledged }}
          >
            <Text style={{ color: theme.colors.foreground }}>
              {visibilityAcknowledged ? "[x]" : "[ ]"}
            </Text>
            <Text style={{ color: theme.colors.foreground }}>
              I understand partner progress visibility will be shared.
            </Text>
          </Pressable>
          <PrimaryButton
            label={acceptInvite.isPending ? "Accepting..." : "Accept invite"}
            disabled={busy || !visibilityAcknowledged}
            onPress={() => {
              void acceptInvite.mutateAsync();
            }}
          />
          <PrimaryButton
            label={declineInvite.isPending ? "Declining..." : "Decline invite"}
            disabled={busy}
            onPress={() => {
              void declineInvite.mutateAsync();
            }}
          />
        </View>
      ) : outgoingInvite ? (
        <View style={[styles.card, { borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Invite pending with {pendingLabel}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Waiting for your partner to accept.
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { borderColor: theme.colors.border }]}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Invite a partner
          </Text>
          <TextInput
            value={partnerSearchInput}
            onChangeText={(value) => {
              setPartnerSearchInput(value);
              setPartnerSearchResults([]);
              setSelectedPartner(null);
              setStatusMessage(null);
            }}
            editable={!searchPartners.isPending}
            autoCapitalize="none"
            placeholder="Partner username"
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.input,
              {
                color: theme.colors.foreground,
                borderColor: theme.colors.border,
              },
            ]}
          />
          <PrimaryButton
            label={searchPartners.isPending ? "Searching..." : "Search"}
            disabled={busy || partnerSearchInput.trim().length === 0}
            onPress={() => {
              void searchPartners.mutateAsync();
            }}
          />
          {partnerSearchResults.map((profile) => {
            const selected = selectedPartner?.id === profile.id;
            return (
              <Pressable
                key={profile.id}
                accessibilityRole="radio"
                accessibilityLabel={`Select @${profile.username}`}
                accessibilityState={{ selected }}
                onPress={() => setSelectedPartner(profile)}
                style={[
                  styles.searchResult,
                  {
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{ color: theme.colors.foreground, fontWeight: "700" }}
                >
                  @{profile.username}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground }}>
                  {profile.display_name}
                </Text>
              </Pressable>
            );
          })}
          <TextInput
            value={inviteMessageInput}
            onChangeText={setInviteMessageInput}
            autoCapitalize="sentences"
            placeholder="Optional message"
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.input,
              {
                color: theme.colors.foreground,
                borderColor: theme.colors.border,
              },
            ]}
          />
          <PrimaryButton
            label={createInvite.isPending ? "Sending invite..." : "Send invite"}
            disabled={busy || !selectedPartner}
            onPress={() => {
              void createInvite.mutateAsync();
            }}
          />
        </View>
      )}
      <PrimaryButton
        label={duo.teamRefreshing ? "Refreshing..." : "Refresh team status"}
        disabled={busy}
        onPress={() => {
          void duo.refreshTeam();
        }}
      />
      {statusMessage ? (
        <Text style={{ color: theme.colors.foreground }}>{statusMessage}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ackRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  searchResult: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
