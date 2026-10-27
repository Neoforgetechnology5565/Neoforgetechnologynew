import { NextResponse, type NextRequest } from "next/server";
import { authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { limit(req, "act", 120); const { project } = await authorize(req, (await params).id, "viewer"); return NextResponse.json({ activity: project.activity ?? [] }); } catch (e) { return fail(e); } }
