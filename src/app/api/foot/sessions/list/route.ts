import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { capturesCol, fail, keyHash, limit, sameOrigin, sessionDTO, sessionsCol, type SessionDoc } from "@/lib/foot/server";

export const runtime = "nodejs";
const schema = z.object({ items: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), key: z.string().min(8).max(100) })).max(30) });

/** The browser keeps {id,key} pairs in localStorage. This returns summaries for the pairs that are still valid. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); limit(req, "list", 60);
    const { items } = schema.parse(await req.json()); const out = [];
    for (const it of items) {
      const snap = await sessionsCol().doc(it.id).get(); if (!snap.exists) continue; const s = snap.data() as SessionDoc;
      if (s.expiresAt < Date.now() || keyHash(it.key) !== s.ownerHash) continue;
      const n = (await capturesCol().where("sessionId", "==", s.id).get()).size; out.push(sessionDTO(s, n));
    }
    return NextResponse.json({ sessions: out.sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch (e) { return fail(e); }
}
