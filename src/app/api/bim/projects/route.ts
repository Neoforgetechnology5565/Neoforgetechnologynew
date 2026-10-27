import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEMOS, fail, keyHash, limit, newId, newKey, projectsCol, publicProject, purgeExpired, retentionMs, sameOrigin, type ProjectDoc } from "@/lib/bim/server";

export const runtime = "nodejs";
const schema = z.object({ demo: z.enum(DEMOS), name: z.string().trim().min(1).max(80).default("Untitled project") });
/** Create a project. The owner key is returned once; only its hash is stored. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); limit(req, "project", 30, 10 * 60_000); const b = schema.parse(await req.json()); const now = Date.now(); const id = newId(), key = newKey();
    const doc: ProjectDoc = { id, demo: b.demo, name: b.name, ownerHash: keyHash(key), settings: {}, files: [], artifacts: [], jobs: [], version: 0, createdAt: now, updatedAt: now, expiresAt: now + retentionMs(), sampleOnly: true };
    await purgeExpired(); await projectsCol().doc(id).set(doc); return NextResponse.json({ project: publicProject(doc), key }, { status: 201 });
  } catch (e) { return fail(e); }
}
