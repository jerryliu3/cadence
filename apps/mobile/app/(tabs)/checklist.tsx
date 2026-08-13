import { Link } from "expo-router";
import { Text } from "react-native";
import { Screen } from "../../src/ui/screen";

export default function ChecklistPlaceholder() {
  return (
    <Screen title="Checklist">
      <Text>Daily completions land in the checklist slice.</Text>
      <Link href="/goals/new">Create a goal</Link>
    </Screen>
  );
}
