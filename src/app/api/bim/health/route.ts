import { NextResponse } from "next/server";
import { ALLOWED_EXT, MAX_UPLOAD_BYTES } from "@/lib/bim/validate";
import { C_BIM, DEMOS, MAX_PROJECT_BYTES, projectsCol, retentionMs } from "@/lib/bim/server";

export const runtime = "nodejs";
export async function GET() {
  let db = "ok"; try { await projectsCol().limit(1).get(); } catch { db = "unavailable"; }
  return NextResponse.json({ ok: db === "ok", database: db, collections: C_BIM, demos: DEMOS, limits: { maxUploadMb: MAX_UPLOAD_BYTES / 1048576, maxProjectMb: MAX_PROJECT_BYTES / 1048576, extensions: ALLOWED_EXT }, retentionHours: retentionMs() / 3600_000, processing: "in-request (no background worker); stages are timed for real", engines: { dxf: "built-in parser", ifc: "web-ifc (MPL-2.0)", dwg: "not supported natively (convert to DXF)", raster: "sharp + built-in wall detector" }, time: new Date().toISOString() }, { status: db === "ok" ? 200 : 503 });
}
