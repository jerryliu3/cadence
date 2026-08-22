import { redirect } from "next/navigation";

export default function BulkGoalPage() {
  redirect("/app/goals/new?mode=multi");
}
