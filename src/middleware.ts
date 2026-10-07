import { NextResponse, type NextRequest } from "next/server";

/**
 * First gate only: bounce requests that carry no session cookie.
 * Real verification (signature, expiry, revocation, admin claim) happens server-side
 * in requireAdminPage() and adminRoute() — never trust this check alone.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (!req.cookies.get("__nf_session")?.value) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
