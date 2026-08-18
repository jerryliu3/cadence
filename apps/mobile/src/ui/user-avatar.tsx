import { Image, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
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
  const resolvedSize = Math.round(size * 2);
  const fallbackFontSize = Math.max(16, Math.round(resolvedSize * 0.34));
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const canRenderImage = normalizedUrl !== null && failedUrl !== normalizedUrl;

  return (
    <View
      style={[
        styles.root,
        {
          width: resolvedSize,
          height: resolvedSize,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
        },
      ]}
    >
      {canRenderImage && normalizedUrl ? (
        <Image
          source={{ uri: normalizedUrl }}
          alt={displayName ?? username ?? "Profile avatar"}
          style={styles.image}
          onError={() => {
            setFailedUrl((previous) =>
              previous === normalizedUrl ? previous : normalizedUrl
            );
          }}
        />
      ) : (
        <Text
          style={{
            color: theme.colors.mutedForeground,
            fontWeight: "700",
            fontSize: fallbackFontSize,
            lineHeight: Math.round(fallbackFontSize * 1.1),
          }}
        >
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
