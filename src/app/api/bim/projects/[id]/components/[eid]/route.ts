import { NextResponse, type NextRequest } from "next/server";
import { loadModel } from "@/lib/bim/process";
import { HttpError, authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
/** Properties of one element: only what exists in the model or was derived by a documented method; `assumed` lists configured values. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; eid: string }> }) {
  try { limit(req, "compget", 240); const p = await params; const { project } = await authorize(req, p.id, "viewer"); const m = await loadModel(project); const id = decodeURIComponent(p.eid);
    const mep = m.mep.elements.find((e) => e.id === id); if (mep) return NextResponse.json({ kind: "mep", element: mep, clashes: m.clashes.filter((c) => c.a.id === id || c.b.id === id) });
    for (const w of m.building?.walls ?? []) { if (w.id === id) return NextResponse.json({ kind: "wall", element: w, clashes: m.clashes.filter((c) => c.a.id === id || c.b.id === id) }); const o = w.openings.find((x) => x.id === id); if (o) return NextResponse.json({ kind: "opening", element: o, wall: w.id }); }
    const room = m.building?.rooms.find((r) => r.id === id); if (room) return NextResponse.json({ kind: "room", element: room });
    const col = m.building?.columns.find((c) => c.id === id); if (col) return NextResponse.json({ kind: "column", element: col });
    const st = m.building?.stairs.find((c) => c.id === id); if (st) return NextResponse.json({ kind: "stair", element: st });
    const ifc = m.ifc?.elements.find((e) => `#${e.id}` === id); if (ifc) return NextResponse.json({ kind: "ifc", element: ifc, clashes: m.clashes.filter((c) => c.a.id === id || c.b.id === id) });
    throw new HttpError(404, "Element not found"); } catch (e) { return fail(e); }
}
