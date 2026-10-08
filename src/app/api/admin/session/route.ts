import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, adminEmails, getAdminUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Exchange a Firebase ID token for an httpOnly session cookie. Only administrators get one. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!rateLimit(`login:${clientIp(req)}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const auth = adminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    // Only recently authenticated tokens may mint a session.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) return NextResponse.json({ error: "Re-authenticate" }, { status: 401 });

    const email = (decoded.email || "").toLowerCase();
    const isAdmin = decoded.admin === true;
    if (!isAdmin && email && adminEmails().includes(email)) {
      // Prevents someone pre-registering an allow-listed address they do not own.
      if (decoded.email_verified !== true) return NextResponse.json({ error: "Verify your email first", code: "unverified" }, { status: 403 });
      // Bootstrap: allow-listed email becomes admin via custom claim — no CLI or manual DB edits required.
      await auth.setCustomUserClaims(decoded.uid, { admin: true });
      // The current ID token predates the claim; the client must force-refresh it and retry.
      return NextResponse.json({ refresh: true });
    }
    if (!isAdmin) return NextResponse.json({ error: "Not authorised" }, { status: 403 });

    const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch (e) {
    console.error("session error", e);
    // Separate "your sign-in was bad" from "the server is misconfigured" so setup problems are visible.
    const code = String((e as { code?: string }).code || "");
    const bad = code.startsWith("auth/id-token") || code === "auth/argument-error" || code === "auth/user-disabled";
    return NextResponse.json(
      bad ? { error: "Invalid credentials" } : { error: "Server setup problem — open /api/health on this site to see what is missing", code: "server" },
      { status: bad ? 401 : 500 },
    );
  }
}

export async function GET() {
  const user = await getAdminUser();
  return NextResponse.json({ user });
}

export async function DELETE() {
  // Revoke server-side so a copied cookie stops working too (verifySessionCookie checks revocation).
  const user = await getAdminUser();
  if (user) await adminAuth().revokeRefreshTokens(user.uid).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
