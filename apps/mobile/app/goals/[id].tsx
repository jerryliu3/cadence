import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { Screen } from "../../src/ui/screen";

export default function EditGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen title="Edit goal">
      <Text>Goal {id} editor lands in the checklist/goals slice.</Text>
    </Screen>
  );
}
