import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mepItems, archItems, type Item } from "@/lib/bim/clash";
import { dist3, obbDistance, obbPenetration, polyArea, polyPerimeter } from "@/lib/bim/geom";
import { loadModel } from "@/lib/bim/process";
import { HttpError, authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
const v3 = z.object({ x: z.number(), y: z.number(), z: z.number() });
const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("distance"), a: v3, b: v3 }), z.object({ type: z.literal("polygon"), points: z.array(z.object({ x: z.number(), y: z.number() })).min(3).max(500) }),
  z.object({ type: z.literal("elements"), ids: z.tuple([z.string().max(40), z.string().max(40)]) }),
]);
/** Server-side measurements computed from the stored geometry (metres). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { limit(req, "meas", 240); const { project } = await authorize(req, (await params).id, "viewer"); const b = schema.parse(await req.json());
    if (b.type === "distance") { const d = { x: b.b.x - b.a.x, y: b.b.y - b.a.y, z: b.b.z - b.a.z }; return NextResponse.json({ type: "distance", distance: dist3(b.a, b.b), dx: d.x, dy: d.y, dz: d.z, horizontal: Math.hypot(d.x, d.y), unit: "m" }); }
    if (b.type === "polygon") return NextResponse.json({ type: "polygon", area: Math.abs(polyArea(b.points)), perimeter: polyPerimeter(b.points), unit: "m" });
    const m = await loadModel(project); const items: Item[] = [...mepItems(m.mep.elements), ...(m.building ? archItems(m.building) : [])]; const A = items.filter((i) => i.id === b.ids[0] && i.obb), B = items.filter((i) => i.id === b.ids[1] && i.obb); if (!A.length || !B.length) throw new HttpError(404, "One of the elements has no measurable box geometry.");
    let best = Infinity, pen = -Infinity; for (const x of A) for (const y of B) { best = Math.min(best, obbDistance(x.obb!, y.obb!)); pen = Math.max(pen, obbPenetration(x.obb!, y.obb!)); }
    return NextResponse.json({ type: "elements", ids: b.ids, minDistance: Math.round(best * 1e4) / 1e4, overlapDepth: pen > 0 ? Math.round(pen * 1e4) / 1e4 : 0, method: "oriented-box distance between the elements' box pieces", unit: "m" }); } catch (e) { return fail(e); }
}
