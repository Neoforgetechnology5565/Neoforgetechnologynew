import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestTopics, writeArticle, aiConfigured } from "@/lib/ai-article";
import { adminRoute } from "@/lib/auth";
import { adminListPosts } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("topics"), focus: z.string().trim().max(120).default("") }),
  z.object({ action: z.literal("write"), topic: z.string().trim().min(5).max(200), angle: z.string().trim().max(400).default("") }),
]);

export const GET = adminRoute(async () => NextResponse.json({ configured: aiConfigured() }));

/** Suggests topics or drafts an article. Nothing is saved — the editor fills in and the admin reviews. */
export const POST = adminRoute(async (req) => {
  const b = body.parse(await req.json());
  if (b.action === "topics") {
    const titles = (await adminListPosts()).map((p) => p.title);
    return NextResponse.json({ topics: await suggestTopics(titles, b.focus) });
  }
  return NextResponse.json({ item: await writeArticle(b.topic, b.angle) });
});
