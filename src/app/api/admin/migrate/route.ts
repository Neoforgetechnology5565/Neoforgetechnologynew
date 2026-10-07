import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { runMigrations } from "@/lib/migrations";

/** One-click, repeatable maintenance: re-applies every migration (each step only creates what is missing). */
export const POST = adminRoute(async () => NextResponse.json(await runMigrations(true)));
