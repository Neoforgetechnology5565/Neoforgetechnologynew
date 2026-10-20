import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

/** Small, frequently polled summary for the admin sidebar: unread items and visitors online now. */
export const GET = adminRoute(async () => {
  const db = adminDb();
  const [inq, chats, online] = await Promise.all([
    db.collection(C.inquiries).where("status", "==", "unread").count().get(),
    db.collection(C.chats).where("unreadAdmin", ">", 0).limit(200).get(),
    db.collection(C.presence).where("at", ">", Date.now() - 90_000).limit(500).get(),
  ]);
  const pages = new Map<string, number>();
  online.docs.forEach((d) => { const p = String(d.data().path || "/"); pages.set(p, (pages.get(p) || 0) + 1); });
  return NextResponse.json({
    unreadInquiries: inq.data().count,
    unreadChats: chats.docs.reduce((n, d) => n + (Number(d.data().unreadAdmin) || 0), 0),
    chatsWaiting: chats.size,
    online: online.size,
    onlinePages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([path, n]) => ({ path, n })),
  });
});
