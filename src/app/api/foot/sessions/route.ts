import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fail, keyHash, limit, newId, newKey, purgeExpired, retentionMs, sameOrigin, sessionDTO, sessionsCol, type SessionDoc } from "@/lib/foot/server";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().max(60).optional(), paper: z.enum(["a4", "letter"]).default("a4"), fit: z.enum(["snug", "regular", "roomy"]).default("regular") });

/** Create a session. The owner key is returned once and only its hash is stored. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); limit(req, "session", 30, 10 * 60_000);
    const b = schema.parse(await req.json().catch(() => ({}))); const now = Date.now(); const id = newId(), key = newKey();
    const doc: SessionDoc = { id, ownerHash: keyHash(key), name: b.name || "Foot measurement", paper: b.paper, fit: b.fit, status: "open", events: [], activeCapture: {}, meshes: [], createdAt: now, updatedAt: now, expiresAt: now + retentionMs() };
    await purgeExpired(); await sessionsCol().doc(id).set(doc);
    return NextResponse.json({ session: sessionDTO(doc, 0), key }, { status: 201 });
  } catch (e) { return fail(e); }
}
