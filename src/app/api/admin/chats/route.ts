import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { C } from "@/lib/db";
import { adminDb } from "@/lib/firebase-admin";

export const GET = adminRoute(async () => {
  const snap = await adminDb().collection(C.chats).orderBy("updatedAt", "desc").limit(200).get();
  return NextResponse.json({
    items: snap.docs.map((d) => {
      const { token: _t, ...rest } = d.data();
      void _t;
      return { id: d.id, ...rest };
    }),
  });
});
