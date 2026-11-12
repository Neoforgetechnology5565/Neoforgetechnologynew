import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { listRecords, storageAvailable } from "@/lib/walkthrough/server";

/** Admin only: every demo found in the site's catalogues with its walkthrough (saved or built-in). */
export const GET = adminRoute(async () => NextResponse.json({ demos: await listRecords(), storage: storageAvailable() }));
