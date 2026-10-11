import { NextResponse } from "next/server";
import { z } from "zod";
import { AI_MODELS, suggestTopics, writeArticle, aiConfigured } from "@/lib/ai-article";
import { adminRoute } from "@/lib/auth";
import { adminListPosts } from "@/lib/db";
import { makeCover, makeFigure } from "@/lib/media-gen";
import type { MediaRef } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("topics"), focus: z.string().trim().max(120).default(""), model: z.enum(AI_MODELS).optional() }),
  z.object({ action: z.literal("write"), topic: z.string().trim().min(5).max(200), angle: z.string().trim().max(400).default(""), model: z.enum(AI_MODELS).optional() }),
]);

export const GET = adminRoute(async () => NextResponse.json({ configured: aiConfigured() }));

/** Suggests topics or drafts an article. Nothing is saved — the editor fills in and the admin reviews. */
export const POST = adminRoute(async (req) => {
  const b = body.parse(await req.json());
  if (b.action === "topics") {
    const titles = (await adminListPosts()).map((p) => p.title);
    return NextResponse.json({ topics: await suggestTopics(titles, b.focus, b.model) });
  }
  const { figures, ...a } = await writeArticle(b.topic, b.angle, b.model);
  const warnings: string[] = [];
  let content = a.content;
  let cover: MediaRef | null = null;
  // Design the media: a branded cover plus the diagrams the article asked for. A failure here never loses the text.
  const results = await Promise.allSettled([makeCover(a.title, a.division), ...figures.map((f) => makeFigure(f, a.division))]);
  if (results[0].status === "fulfilled") cover = results[0].value;
  else warnings.push("The cover image couldn't be designed — use the Generate cover button or upload one.");
  figures.forEach((f, i) => {
    const r = results[i + 1];
    const marker = new RegExp(`\\[\\[figure:${i + 1}\\]\\]`);
    content = r.status === "fulfilled" ? content.replace(marker, `![${f.alt.replace(/[\]\n]/g, " ")}](${r.value.url})`) : content.replace(marker, "");
    if (r.status !== "fulfilled") warnings.push(`Diagram ${i + 1} couldn't be created.`);
  });
  content = content.replace(/\[\[figure:\d\]\]/g, "");
  return NextResponse.json({ item: { ...a, content, cover, warnings } });
});
