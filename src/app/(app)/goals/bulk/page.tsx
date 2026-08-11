import { redirect } from "next/navigation";

export default function BulkGoalPage() {
  redirect("/goals/new?mode=multi");
}
