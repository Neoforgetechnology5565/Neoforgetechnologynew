import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cloudinaryConfigProblem } from "@/lib/cloudinary-config";
import { C, getContactSettings } from "@/lib/db";
import { adminAuth, adminDb, isFirebaseConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each probe gets 8 s so an unreachable database reports an error instead of hanging the page. */
const within = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timed out after 8 s")), 8000))]);

const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "ADMIN_EMAILS",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET",
];

/** Deployment self-check. Reports which variables are present (never their values) and whether Firebase answers. */
export async function GET() {
  const env = Object.fromEntries(REQUIRED.map((k) => [k, Boolean(process.env[k])]));
  const out: Record<string, unknown> = { firestore: "skipped", firestoreWrite: "skipped", chat: "skipped", auth: "skipped", cloudinary: cloudinaryConfigProblem() ?? "ok" };
  if (isFirebaseConfigured()) {
    try { await within(adminDb().collection("meta").doc("schema").get()); out.firestore = "ok"; }
    catch (e) { out.firestore = `error: ${errCode(e)}`; }
    try { // write + delete a scratch doc: proves the service account can create data, not just read it
      const ref = adminDb().collection("meta").doc("healthcheck");
      await within(ref.set({ at: Date.now() })); await within(ref.delete()); out.firestoreWrite = "ok";
    } catch (e) { out.firestoreWrite = `error: ${errCode(e)}`; }
    // Dry run of the live-chat start path, step by step, so a failure names the step. Cleans up after itself.
    let step = "settings";
    try {
      const settings = await within(getContactSettings());
      step = "create conversation";
      const ref = adminDb().collection(C.chats).doc();
      await within(ref.set({ name: "health", email: "", token: randomBytes(24).toString("hex"), createdAt: Date.now(), updatedAt: Date.now(), lastMessage: "x", unreadAdmin: 1 }));
      step = "create message";
      await within(ref.collection("messages").add({ from: "visitor", text: "x", file: null, createdAt: Date.now() }));
      step = "clean up";
      await within(adminDb().recursiveDelete(ref));
      out.chat = settings.chatEnabled ? "ok" : "ok (chat is switched off in Site content)";
    } catch (e) { out.chat = `error at "${step}": ${errCode(e)}`; }
    try { await within(adminAuth().listUsers(1)); out.auth = "ok"; }
    catch (e) { out.auth = `error: ${errCode(e)}`; }
  }
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  return NextResponse.json({ ok: !missing.length && out.firestore === "ok" && out.firestoreWrite === "ok" && String(out.chat).startsWith("ok") && out.auth === "ok" && out.cloudinary === "ok", missing, ...out });
}

const errCode = (e: unknown) => {
  const x = e as { code?: string | number; errorInfo?: { code?: string }; message?: string };
  const msg = (x.message || "").replace(/-----[\s\S]*/g, "").slice(0, 160);
  return `${(e as Error)?.name ?? "Error"} ${String(x.errorInfo?.code ?? x.code ?? "")}`.trim() + (msg ? ` — ${msg}` : "");
};
