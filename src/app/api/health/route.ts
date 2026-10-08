import { NextResponse } from "next/server";
import { adminAuth, adminDb, isFirebaseConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "ADMIN_EMAILS",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
];

/** Deployment self-check. Reports which variables are present (never their values) and whether Firebase answers. */
export async function GET() {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])]));
  const out: Record<string, unknown> = { firestore: "skipped", auth: "skipped" };
  if (isFirebaseConfigured()) {
    try { await adminDb().collection("meta").doc("schema").get(); out.firestore = "ok"; }
    catch (e) { out.firestore = `error: ${errCode(e)}`; }
    try { await adminAuth().listUsers(1); out.auth = "ok"; }
    catch (e) { out.auth = `error: ${errCode(e)}`; }
  }
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  return NextResponse.json({ ok: !missing.length && out.firestore === "ok" && out.auth === "ok", missing, ...out });
}

const errCode = (e: unknown) => {
  const x = e as { code?: string | number; errorInfo?: { code?: string }; message?: string };
  const msg = (x.message || "").replace(/-----[\s\S]*/g, "").slice(0, 140);
  return String(x.errorInfo?.code ?? x.code ?? "unknown") + (msg ? ` (${msg})` : "");
};
