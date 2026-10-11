import { NextResponse } from "next/server";
import { adminRoute, HttpError } from "@/lib/auth";
import { parsePdf } from "@/lib/pdf-import";
import { makeCover, uploadPng } from "@/lib/media-gen";
import { mediaSchema } from "@/lib/schemas";
import type { MediaRef } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

/** Reads a PDF the admin just uploaded to our Cloudinary and returns a ready-to-edit article draft. Nothing is saved. */
export const POST = adminRoute(async (req) => {
  const { file } = (await req.json()) as { file?: unknown };
  const media = mediaSchema.parse(file);
  const res = await fetch(media.url, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res) throw new HttpError(502, "Could not download the PDF from Cloudinary. Try again.");
  if (res.status === 401 || res.status === 403)
    throw new HttpError(502, "Cloudinary blocked reading the PDF. In Cloudinary go to Settings → Security and tick “PDF and ZIP files delivery”, then try again.");
  if (!res.ok) throw new HttpError(502, `Cloudinary returned ${res.status} for the PDF.`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new HttpError(413, "That PDF is too large to scan (max 25 MB).");
  if (new TextDecoder().decode(buf.slice(0, 5)) !== "%PDF-") throw new HttpError(400, "That file isn't a valid PDF.");
  let r;
  const stored = new Map<string, MediaRef>();
  try {
    r = await parsePdf(buf, media.name || "", {
      upload: async (png, name) => { const m = await uploadPng(png, "blog", name); stored.set(m.url, m); return m.url; },
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, "Could not read this PDF (it may be password-protected or damaged). Please fill the article manually.");
  }
  const { coverUrl, ...item } = r;
  // Cover: the PDF's own biggest picture if it has one, otherwise a designed cover built from the title.
  let cover: MediaRef | null = coverUrl ? stored.get(coverUrl) ?? null : null;
  if (!cover && item.title) cover = await makeCover(item.title, item.division).catch(() => null);
  if (!cover && item.content) item.warnings.push("No cover image could be created — use the Generate cover button or upload one.");
  const content = item.content ? `${item.content}\n\n---\n\n[Download the full PDF](${media.url})` : "";
  return NextResponse.json({ item: { ...item, content, cover } });
});
