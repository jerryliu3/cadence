import { redirect } from "next/navigation";

export default function ChecklistPage() {
  redirect("/calendar?surface=checklist");
}
