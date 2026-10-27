import { NextResponse, type NextRequest } from "next/server";
import { deleteJob, fail, getJob, limit, publicJob, requireToken } from "@/lib/cctv/server";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: P) {
  try { limit(req, "read", 240); return NextResponse.json(publicJob(await getJob((await params).id))); } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest, { params }: P) {
  try { const id = (await params).id; await requireToken(req, id); await deleteJob(id); return NextResponse.json({ ok: true }); } catch (e) { return fail(e); }
}
