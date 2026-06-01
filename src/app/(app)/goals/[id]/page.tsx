import { GoalForm } from "@/features/today/goal-form";

interface GoalEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function GoalEditPage({ params }: GoalEditPageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <GoalForm goalId={id} />
    </div>
  );
}
