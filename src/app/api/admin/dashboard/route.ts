import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C, adminListProjects } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

export const GET = adminRoute(async () => {
  const db = adminDb();
  const [projects, inquiries, chats, totals] = await Promise.all([
    adminListProjects(),
    db.collection(C.inquiries).orderBy("createdAt", "desc").limit(200).get(),
    db.collection(C.chats).orderBy("updatedAt", "desc").limit(200).get(),
    db.collection(C.totals).doc("all").get(),
  ]);
  const inq = inquiries.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; name: string; projectType: string; status: string; createdAt: number });
  const ch = chats.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; name: string; unreadAdmin?: number; updatedAt: number; lastMessage?: string });

  const activity = [
    ...inq.slice(0, 6).map((i) => ({ at: i.createdAt, kind: "Inquiry", text: `${i.name} — ${i.projectType}`, href: "/admin/inbox" })),
    ...ch.slice(0, 6).map((c) => ({ at: c.updatedAt, kind: "Chat", text: `${c.name}: ${c.lastMessage ?? ""}`.slice(0, 90), href: "/admin/chats" })),
    ...projects.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((p) => ({ at: p.updatedAt, kind: "Project", text: `${p.title} (${p.status})`, href: `/admin/projects/${p.id}` })),
  ].sort((a, b) => b.at - a.at).slice(0, 10);

  return NextResponse.json({
    projects: { total: projects.length, published: projects.filter((p) => p.status === "published").length, draft: projects.filter((p) => p.status === "draft").length },
    inquiries: { total: inq.length, unread: inq.filter((i) => i.status === "unread").length },
    unreadChats: ch.reduce((n, c) => n + (c.unreadAdmin || 0), 0),
    visits: (totals.data()?.visits as number) || 0,
    views: (totals.data()?.views as number) || 0,
    uniqueVisitors: (totals.data()?.uniqueVisitors as number) || 0,
    activity,
  });
});
