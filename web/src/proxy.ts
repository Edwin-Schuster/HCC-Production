import { NextResponse, type NextRequest } from "next/server";

/** Passes the requested path to Server Components so sign-in can send people back where they were. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-hcc-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|brand/|fonts/|files/|favicon).*)"],
};
