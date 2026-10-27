import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fail, keyHash, limit, projectsCol, publicProject, sameOrigin, type ProjectDoc } from "@/lib/bim/server";

export const runtime = "nodejs";
const schema = z.object({ items: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), key: z.string().min(8).max(100) })).max(40), demo: z.string().optional() });
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req); limit(req, "plist", 60); const { items, demo } = schema.parse(await req.json()); const out = [];
    for (const it of items) { const s = await projectsCol().doc(it.id).get(); if (!s.exists) continue; const p = s.data() as ProjectDoc; if (p.expiresAt < Date.now() || keyHash(it.key) !== p.ownerHash || (demo && p.demo !== demo)) continue; const { files, artifacts, jobs, ...rest } = publicProject(p); out.push({ ...rest, fileCount: files.length, artifactCount: artifacts.length, lastJob: jobs[0] ? { status: jobs[0].status, at: jobs[0].startedAt } : null }); }
    return NextResponse.json({ projects: out.sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch (e) { return fail(e); }
}
