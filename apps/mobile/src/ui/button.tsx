import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";
import { useTheme } from "../theme";

export function PrimaryButton({
  label,
  ...props
}: PressableProps & { label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.colors.primary, opacity: pressed || props.disabled ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.primaryForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  label: { fontWeight: "700", fontSize: 16 },
});
