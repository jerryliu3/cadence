import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { createClientUuid } from "@cadence/shared/ids";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useTheme } from "../../theme";
import { PrimaryButton } from "../../ui/button";
import { Screen } from "../../ui/screen";
import {
  MOBILE_GOAL_EDIT_SELECT,
  buildMobileGoalCreateArgs,
  buildMobileGoalUpdateArgs,
  type MobileGoalEditSnapshot,
} from "./goal-form-model";

async function decodeBase64(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function uploadGoalPhoto({
  userId,
  goalId,
  uri,
}: {
  userId: string;
  goalId: string;
  uri: string;
}) {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) {
    throw new Error("Could not read the photo.");
  }
  const objectPath = `${userId}/${goalId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("goal-photos")
    .upload(objectPath, await decodeBase64(manipulated.base64), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (uploadError) {
    throw uploadError;
  }
  const { error: photoError } = await supabase.rpc("set_goal_photo_path", {
    p_goal_id: goalId,
    p_photo_path: objectPath,
  });
  if (photoError) {
    throw photoError;
  }
}

export function GoalFormScreen({ goalId }: { goalId?: string }) {
  const theme = useTheme();
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [existingGoal, setExistingGoal] =
    useState<MobileGoalEditSnapshot | null>(null);
  const [persistedGoalId, setPersistedGoalId] = useState<string | null>(null);
  const [photoRetryPending, setPhotoRetryPending] = useState(false);
  const isEditing = Boolean(goalId);

  useEffect(() => {
    if (!goalId) {
      return;
    }
    void supabase
      .from("goals")
      .select(MOBILE_GOAL_EDIT_SELECT)
      .eq("id", goalId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setMessage("Goal could not be loaded.");
          return;
        }
        const snapshot = data as MobileGoalEditSnapshot;
        setExistingGoal(snapshot);
        setPersistedGoalId(snapshot.id);
        if (data?.title) {
          setTitle(data.title);
        }
      });
  }, [goalId]);

  return (
    <Screen title={isEditing ? "Edit goal" : "New goal"}>
      <TextInput
        placeholder="Title"
        placeholderTextColor={theme.colors.mutedForeground}
        value={title}
        onChangeText={setTitle}
        style={[styles.input, { color: theme.colors.foreground, borderColor: theme.colors.border }]}
      />
      <PrimaryButton
        disabled={
          busy ||
          title.trim().length === 0 ||
          (isEditing && existingGoal === null)
        }
        label={
          busy ? "Saving..." : photoRetryPending ? "Retry photo" : "Save"
        }
        onPress={async () => {
          if (!userId) {
            return;
          }
          setBusy(true);
          setMessage(null);
          if (photoRetryPending && persistedGoalId && pendingPhotoUri) {
            try {
              await uploadGoalPhoto({
                userId,
                goalId: persistedGoalId,
                uri: pendingPhotoUri,
              });
              setPendingPhotoUri(null);
              setPhotoRetryPending(false);
              await queryClient.invalidateQueries({
                queryKey: ["mobile-goals"],
              });
              router.back();
            } catch (photoError) {
              setMessage(
                photoError instanceof Error
                  ? photoError.message
                  : "Goal is saved, but the photo could not be uploaded."
              );
            } finally {
              setBusy(false);
            }
            return;
          }

          const savedGoalId = goalId ?? createClientUuid();
          if (isEditing && !existingGoal) {
            setBusy(false);
            setMessage("Goal could not be loaded.");
            return;
          }
          const args =
            isEditing && existingGoal
              ? buildMobileGoalUpdateArgs(existingGoal, title)
              : buildMobileGoalCreateArgs(title, savedGoalId);
          const { error } = isEditing
            ? await supabase.rpc("update_goal", args)
            : await supabase.rpc("create_goal", args);
          if (error) {
            setBusy(false);
            setMessage(error.message);
            return;
          }
          setPersistedGoalId(savedGoalId);
          if (pendingPhotoUri) {
            try {
              await uploadGoalPhoto({
                userId,
                goalId: savedGoalId,
                uri: pendingPhotoUri,
              });
              setPendingPhotoUri(null);
            } catch (photoError) {
              setBusy(false);
              setPhotoRetryPending(true);
              setMessage(
                photoError instanceof Error
                  ? photoError.message
                  : "Goal saved, but the photo could not be uploaded."
              );
              await queryClient.invalidateQueries({ queryKey: ["mobile-goals"] });
              return;
            }
          }
          await queryClient.invalidateQueries({ queryKey: ["mobile-goals"] });
          setBusy(false);
          router.back();
        }}
      />
      {isEditing ? (
        <View style={{ gap: 8 }}>
          <PrimaryButton
            disabled={busy}
            label="Archive"
            onPress={async () => {
              if (!goalId) {
                return;
              }
              setBusy(true);
              const { error } = await supabase.rpc("set_goal_archived", {
                p_goal_id: goalId,
                p_archived: true,
              });
              setBusy(false);
              if (error) {
                setMessage(error.message);
                return;
              }
              await queryClient.invalidateQueries({ queryKey: ["mobile-goals"] });
              router.back();
            }}
          />
          <PrimaryButton
            disabled={busy}
            label="Delete"
            onPress={async () => {
              if (!goalId) {
                return;
              }
              setBusy(true);
              const { error } = await supabase.rpc("soft_delete_goal", {
                p_goal_id: goalId,
              });
              setBusy(false);
              if (error) {
                setMessage(error.message);
                return;
              }
              await queryClient.invalidateQueries({ queryKey: ["mobile-goals"] });
              router.back();
            }}
          />
        </View>
      ) : null}
      <PrimaryButton
        disabled={busy}
        label={pendingPhotoUri ? "Photo selected" : "Add photo"}
        onPress={async () => {
          const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
            base64: false,
          });
          if (picked.canceled || !picked.assets[0]) {
            return;
          }
          const uri = picked.assets[0].uri;
          if (!isEditing || !userId || !goalId) {
            setPendingPhotoUri(uri);
            setMessage("Photo will upload when you save.");
            return;
          }
          setBusy(true);
          try {
            await uploadGoalPhoto({ userId, goalId, uri });
            setPendingPhotoUri(null);
            setMessage("Photo saved.");
          } catch (photoError) {
            setMessage(
              photoError instanceof Error ? photoError.message : "Could not save the photo."
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {message ? <Text style={{ color: theme.colors.foreground }}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
