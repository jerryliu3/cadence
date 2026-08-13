import { useLocalSearchParams } from "expo-router";
import { GoalFormScreen } from "../../src/features/goals/GoalFormScreen";

export default function EditGoalRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GoalFormScreen goalId={id} />;
}
