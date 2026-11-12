import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

/** Passes the requested path to Server Components so sign-in can send people back where they were. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-hcc-path", request.nextUrl.pathname + request.nextUrl.search);
  // Without a session, / is the public site's home page; signed-in staff get the app's home as before.
  if (request.nextUrl.pathname === "/" && !request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.rewrite(new URL("/welcome", request.url), { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|brand/|fonts/|files/|favicon).*)"],
};
