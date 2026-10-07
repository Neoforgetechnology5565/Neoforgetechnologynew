import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "./firebase-admin";

export const SESSION_COOKIE = "__nf_session";
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 days

export const adminEmails = (): string[] =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export interface AdminUser {
  uid: string;
  email: string;
}

/** Verifies the session cookie (including revocation) and the admin custom claim. */
export async function getAdminUser(): Promise<AdminUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

async function verifyToken(token: string): Promise<AdminUser | null> {
  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    if (decoded.admin !== true || !decoded.email) return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/** For server components / layouts in /admin. */
export async function requireAdminPage(): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** CSRF defence for cookie-authenticated mutations: Origin must match Host. */
function sameOrigin(req: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") || req.headers.get("host"));
  } catch {
    return false;
  }
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: Ctx<P>, user: AdminUser) => Promise<Response> | Response;

/** Wraps an API route so it requires an authenticated administrator. */
export function adminRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
    const user = await getAdminUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      return await handler(req, ctx, user);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e && typeof e === "object" && "issues" in e) {
    return NextResponse.json({ error: "Validation failed", issues: (e as { issues: unknown }).issues }, { status: 400 });
  }
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
