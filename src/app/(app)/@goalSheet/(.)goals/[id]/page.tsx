import { GoalEditSheetEntry } from "@/features/goals/goal-edit-sheet-entry";

interface GoalEditSheetPageProps {
  params: Promise<{ id: string }>;
}

export default async function GoalEditSheetPage({ params }: GoalEditSheetPageProps) {
  const { id } = await params;
  return <GoalEditSheetEntry goalId={id} />;
}
