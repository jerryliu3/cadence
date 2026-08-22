import { redirect } from "next/navigation";

export default function TasksPage() {
  redirect("/app/calendar?surface=tasks");
}
