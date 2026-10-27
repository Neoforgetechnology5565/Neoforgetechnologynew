import { NextResponse } from "next/server";
import { capabilities } from "@/lib/cctv/server";
export const runtime = "nodejs";
export const GET = () => NextResponse.json(capabilities());
