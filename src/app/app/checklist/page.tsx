import { redirect } from "next/navigation";

export default function ChecklistPage() {
  redirect("/app/calendar?surface=checklist");
}
