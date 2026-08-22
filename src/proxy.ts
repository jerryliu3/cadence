import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && request.nextUrl.search.length === 0) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app/calendar";
    return NextResponse.redirect(redirectUrl);
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sentry-tunnel|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
