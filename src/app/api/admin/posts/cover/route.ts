import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/auth";
import { makeCover } from "@/lib/media-gen";

export const runtime = "nodejs";
export const maxDuration = 30;

const body = z.object({ title: z.string().trim().min(3).max(160), division: z.string().max(40).default("") });

/** Designs a branded cover image from the article title and uploads it to Cloudinary. */
export const POST = adminRoute(async (req) => {
  const b = body.parse(await req.json());
  return NextResponse.json({ item: await makeCover(b.title, b.division) });
});
