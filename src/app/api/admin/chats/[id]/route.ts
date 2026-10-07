import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { chatMessageSchema } from "@/lib/schemas";

export const GET = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const ref = adminDb().collection(C.chats).doc(id);
  const after = Number(req.nextUrl.searchParams.get("after") || 0);
  const snap = await ref.collection("messages").where("createdAt", ">", after).orderBy("createdAt").limit(200).get();
  await ref.update({ unreadAdmin: 0 });
  return NextResponse.json({ messages: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

export const POST = adminRoute<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const data = chatMessageSchema.parse(await req.json());
  const ref = adminDb().collection(C.chats).doc(id);
  const now = Date.now();
  await ref.collection("messages").add({ from: "admin", text: data.text, file: data.file, createdAt: now });
  await ref.update({ updatedAt: now, lastMessage: `You: ${data.text}`.slice(0, 120) });
  return NextResponse.json({ ok: true });
});

export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  const ref = adminDb().collection(C.chats).doc((await params).id);
  await adminDb().recursiveDelete(ref);
  return NextResponse.json({ ok: true });
});
