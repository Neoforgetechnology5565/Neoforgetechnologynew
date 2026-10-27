import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FOOT_LIMITS, type MeshAssetDTO } from "@/lib/foot/api-types";
import { MESH_LIMITS, measureMesh, parseObj } from "@/lib/foot/mesh";
import { HttpError, authorize, fail, limit, newId, sameOrigin, touch } from "@/lib/foot/server";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
const q = z.object({ side: z.enum(["left", "right"]), unit: z.enum(["mm", "cm", "m"]), filename: z.string().max(120).default("scan.obj") });

/** Import an existing OBJ foot scan (body = the .obj text). The mesh is measured and discarded: only the measurement is stored. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    sameOrigin(req); limit(req, "mesh", 10, 10 * 60_000); const { session } = await authorize(req, (await params).id);
    const u = new URL(req.url); const o = q.parse({ side: u.searchParams.get("side"), unit: u.searchParams.get("unit"), filename: u.searchParams.get("filename") ?? undefined });
    if (Number(req.headers.get("content-length") || 0) > MESH_LIMITS.maxBytes) throw new HttpError(413, `OBJ files are limited to ${FOOT_LIMITS.objMaxBytes / 1048576} MB.`);
    const text = await req.text(); if (text.length > MESH_LIMITS.maxBytes) throw new HttpError(413, "OBJ file too large.");
    let measurement; try { measurement = measureMesh(parseObj(text), o.unit); } catch (e) { throw new HttpError(422, (e as Error).message); }
    const asset: MeshAssetDTO = { id: newId(), side: o.side, kind: "imported-obj", filename: o.filename, unit: o.unit, createdAt: Date.now(), measurement: { lengthMm: measurement.lengthMm, widthMm: measurement.widthMm, heightMm: measurement.heightMm, vertexCount: measurement.vertexCount, faceCount: measurement.faceCount, notes: measurement.notes } };
    await touch(session.id, { meshes: [...(session.meshes ?? []).filter((m) => m.side !== o.side), asset] });
    return NextResponse.json({ mesh: asset }, { status: 201 });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try { sameOrigin(req); const { session } = await authorize(req, (await params).id); await touch(session.id, { meshes: [] }); return NextResponse.json({ deleted: true }); } catch (e) { return fail(e); }
}
