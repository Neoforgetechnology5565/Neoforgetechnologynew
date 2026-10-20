import { after, NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import { notifyChatVisitor } from "@/lib/notify-visitor";
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
  await ref.update({ updatedAt: now, lastMessage: `You: ${data.text}`.slice(0, 120), humanTakeover: true, wantsHuman: false }); // once a person replies, the AI stops
  // every reply you send is also emailed to the address the visitor gave, and pushed to their phone/browser if they opted in
  if (data.text) after(() => notifyChatVisitor(id, data.text, { email: true, from: "you" }));
  return NextResponse.json({ ok: true });
});

export const DELETE = adminRoute<{ id: string }>(async (_req, { params }) => {
  const ref = adminDb().collection(C.chats).doc((await params).id);
  await adminDb().recursiveDelete(ref);
  return NextResponse.json({ ok: true });
});
