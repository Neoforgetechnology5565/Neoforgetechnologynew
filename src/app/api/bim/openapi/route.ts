import { NextResponse, type NextRequest } from "next/server";
import { openApi } from "@/lib/bim/openapi";

export const runtime = "nodejs";
export function GET(req: NextRequest) { return NextResponse.json(openApi(new URL(req.url).origin), { headers: { "cache-control": "public, max-age=300" } }); }
