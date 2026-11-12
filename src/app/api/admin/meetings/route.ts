import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";
import type { MeetingRequest } from "@/lib/types";

export const GET = adminRoute(async () => {
  const snap = await adminDb().collection(C.meetings).orderBy("start", "desc").limit(300).get();
  return NextResponse.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MeetingRequest) });
});
