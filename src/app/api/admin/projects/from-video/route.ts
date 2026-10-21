import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, HttpError } from "@/lib/auth";
import { adminListCategories } from "@/lib/db";
import { uploadPng } from "@/lib/media-gen";
import { parseVideo } from "@/lib/video";
import { fetchThumbnail, projectFromVideo, readVideo, type VideoScan } from "@/lib/video-import";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Scans a YouTube/Vimeo link and returns project fields (and the video thumbnail, stored on our Cloudinary, as a cover). Nothing is saved. */
export const POST = adminRoute(async (req) => {
  const { url, cover } = z.object({ url: z.string().trim().max(500), cover: z.boolean().default(false) }).parse(await req.json());
  const v = parseVideo(url);
  if (!v) throw new HttpError(400, "That doesn't look like a YouTube or Vimeo link.");
  const facts = await readVideo(v);
  if (!facts.title && !facts.description) throw new HttpError(422, "Could not read anything from that video. Check the link is public, or fill the fields by hand.");
  const cats = (await adminListCategories()).filter((c) => c.enabled).map((c) => ({ name: c.name, slug: c.slug, division: c.division }));
  const { project, ai } = await projectFromVideo(facts, cats);
  const warnings: string[] = [];
  if (!facts.description) warnings.push("The video has no description, so only the title was used.");
  if (!ai) warnings.push("AI isn't set up, so the text was copied from the video's description as written.");
  let coverMedia = null;
  if (cover) {
    const img = await fetchThumbnail(v, facts.thumbnail);
    if (img) coverMedia = await uploadPng(img, "projects", `video-${v.id}.jpg`, "jpg").catch(() => null);
    if (!coverMedia) warnings.push("The video's thumbnail couldn't be saved as a cover image.");
  }
  const scan: VideoScan = { project, coverUrl: "", ai, read: { description: !!facts.description, transcript: !!facts.transcript }, warnings };
  return NextResponse.json({ item: { ...scan, cover: coverMedia, category: cats.find((c) => c.slug === project.categorySlug && c.division === project.division) ? project.categorySlug : "" } });
});
