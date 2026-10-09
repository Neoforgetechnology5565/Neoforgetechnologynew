import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { adminRoute } from "@/lib/auth";
import { cloudinaryConfigProblem } from "@/lib/cloudinary-config";

export const runtime = "nodejs";

const ALLOWED = {
  image: ["jpg", "jpeg", "png", "webp", "gif", "svg", "pdf"], // PDFs are stored as image resources so Cloudinary can render page thumbnails
  video: ["mp4", "webm", "mov"],
  raw: ["zip", "dwg", "dxf", "rvt", "rfa", "skp", "rbz", "ifc", "json", "csv", "txt", "docx", "xlsx", "pptx", "dll", "bundle"],
};

/** Returns a signed Cloudinary upload payload; the browser then uploads straight to Cloudinary. */
export const POST = adminRoute(async (req) => {
  const { kind, folder } = (await req.json().catch(() => ({}))) as { kind?: "image" | "video" | "raw"; folder?: string };
  if (!kind || !(kind in ALLOWED)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  const problem = cloudinaryConfigProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !secret) return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 503 });

  const safeFolder = `neoforge/${(folder || "projects").replace(/[^a-z0-9/_-]/gi, "").slice(0, 60)}`;
  const timestamp = Math.round(Date.now() / 1000);
  const allowed_formats = ALLOWED[kind].join(",");
  const params = { timestamp, folder: safeFolder, allowed_formats };
  const signature = cloudinary.utils.api_sign_request(params, secret);
  return NextResponse.json({ cloudName, apiKey, timestamp, folder: safeFolder, allowed_formats, signature, resourceType: kind });
});
