import { Redirect } from "expo-router";

export default function ChecklistRoute() {
  return <Redirect href="/(tabs)/calendar?surface=checklist" />;
}
