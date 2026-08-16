import { redirect } from "next/navigation";

export default function TasksPage() {
  redirect("/calendar?surface=tasks");
}
