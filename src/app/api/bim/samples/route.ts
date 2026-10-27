import { NextResponse, type NextRequest } from "next/server";
import { SAMPLES } from "@/lib/bim/samples-registry";

export const runtime = "nodejs";
export async function GET(req: NextRequest) { const demo = new URL(req.url).searchParams.get("demo"); return NextResponse.json({ samples: SAMPLES.filter((s) => !demo || s.demo === demo).map((s) => ({ id: s.id, demo: s.demo, name: s.name, description: s.description, files: s.files.map((f) => ({ name: f.name, role: f.role, format: f.format })), note: "Synthetic sample: results are labelled as sample data." })) }); }
