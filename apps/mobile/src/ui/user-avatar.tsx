import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

function getInitials(displayName?: string | null, username?: string | null) {
  const source = (displayName ?? username ?? "").trim();
  if (!source) {
    return "??";
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  avatarUrl,
  displayName,
  username,
  size = 44,
}: {
  avatarUrl: string | null;
  displayName?: string | null;
  username?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  const initials = getInitials(displayName, username);
  const normalizedUrl = avatarUrl?.trim() ? avatarUrl.trim() : null;

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
        },
      ]}
    >
      {normalizedUrl ? (
        <Image source={{ uri: normalizedUrl }} style={styles.image} />
      ) : (
        <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
