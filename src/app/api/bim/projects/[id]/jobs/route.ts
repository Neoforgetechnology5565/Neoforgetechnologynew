import { NextResponse, type NextRequest } from "next/server";
import { authorize, fail, limit } from "@/lib/bim/server";

export const runtime = "nodejs";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { limit(req, "jobs", 240); const { project } = await authorize(req, (await params).id, "viewer"); const q = new URL(req.url).searchParams.get("job"); return NextResponse.json(q ? { job: project.jobs.find((j) => j.id === q) ?? null } : { jobs: project.jobs }); } catch (e) { return fail(e); } }
