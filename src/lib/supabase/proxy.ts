import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildLoginHref } from "@/lib/auth/login-redirect";
import { readBearerToken } from "@/lib/supabase/auth-header";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/" || pathname.startsWith("/landing/")) {
    return NextResponse.next({ request });
  }

  if (readBearerToken(request)) {
    return NextResponse.next({ request });
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as CookieOptions);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && pathname.startsWith("/app")) {
    const nextPath = `${pathname}${request.nextUrl.search}`;
    const loginUrl = new URL(buildLoginHref(nextPath), request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
