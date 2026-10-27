import { NextResponse, type NextRequest } from "next/server";
import { loadModel } from "@/lib/bim/process";
import { HttpError, authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
/** Component search: `q` matches id, tag, name and property values; filters `category`, `system`, `level`. Paginated. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { limit(req, "comp", 240); const { project } = await authorize(req, (await params).id, "viewer"); if (!project.modelBlob) throw new HttpError(404, "No model yet"); const m = await loadModel(project); const u = new URL(req.url); const q = (u.searchParams.get("q") ?? "").toLowerCase().trim(); const cat = u.searchParams.get("category"), sys = u.searchParams.get("system"), lvl = u.searchParams.get("level"); const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0), lim = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 50));
    type Row = { id: string; kind: "mep" | "wall" | "opening" | "room" | "column" | "stair" | "ifc"; tag: string; category: string; system?: string; level?: string; summary: string };
    const rows: Row[] = [];
    for (const e of m.mep.elements) rows.push({ id: e.id, kind: "mep", tag: e.tag, category: e.category, system: e.system, level: e.level, summary: Object.entries(e.props).map(([k, v]) => `${k}: ${v}`).join("; ") });
    for (const w of m.building?.walls ?? []) { rows.push({ id: w.id, kind: "wall", tag: w.id, category: `wall-${w.kind}`, level: w.level, summary: `thickness ${w.thickness} m, height ${w.height} m` }); for (const o of w.openings) rows.push({ id: o.id, kind: "opening", tag: o.id, category: o.kind, level: w.level, summary: `${o.width} x ${o.height} m, sill ${o.sill} m, wall ${w.id}` }); }
    for (const r of m.building?.rooms ?? []) rows.push({ id: r.id, kind: "room", tag: r.name, category: "space", level: r.level, summary: `net area ${r.area} m2` });
    for (const e of m.ifc?.elements ?? []) rows.push({ id: `#${e.id}`, kind: "ifc", tag: e.name || e.cls, category: e.cat, system: e.sys, level: e.storey, summary: `${e.cls} ${e.guid} ${Object.values(e.props).flatMap((o) => Object.entries(o).map(([k, v]) => `${k}=${v}`)).slice(0, 20).join(" ")}` });
    const f = rows.filter((r) => (!q || `${r.id} ${r.tag} ${r.category} ${r.system ?? ""} ${r.summary}`.toLowerCase().includes(q)) && (!cat || r.category === cat) && (!sys || r.system === sys) && (!lvl || r.level === lvl));
    return NextResponse.json({ total: f.length, offset, items: f.slice(offset, offset + lim) }); } catch (e) { return fail(e); }
}
