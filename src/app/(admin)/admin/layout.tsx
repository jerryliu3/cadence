import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdminContextFromCookies } from "@/lib/api/admin-context";
import { ApiRouteError } from "@/lib/api/route";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    const context = await requireAdminContextFromCookies("moderator");
    if (!context) {
      notFound();
    }
  } catch (error) {
    if (error instanceof ApiRouteError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }

  return <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">{children}</div>;
}
