import { NextResponse, type NextRequest } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Public signing endpoint for visitor attachments (contact form + chat).
 * Restricted to a dedicated folder and a conservative format list, and rate limited.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`upl:${clientIp(req)}`, 12, 10 * 60_000)) return NextResponse.json({ error: "Too many uploads" }, { status: 429 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !secret) return NextResponse.json({ error: "Uploads are unavailable" }, { status: 503 });

  const folder = "neoforge/inquiries";
  const timestamp = Math.round(Date.now() / 1000);
  const allowed_formats = "jpg,jpeg,png,webp,pdf";
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder, allowed_formats }, secret);
  return NextResponse.json({ cloudName, apiKey, timestamp, folder, allowed_formats, signature, resourceType: "image" });
}
