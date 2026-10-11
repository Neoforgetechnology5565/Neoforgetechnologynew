import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { adminListPosts } from "@/lib/db";
import { savePost } from "@/lib/post-write";

export const GET = adminRoute(async () => NextResponse.json({ items: await adminListPosts() }));
export const POST = adminRoute(async (req) => NextResponse.json({ id: await savePost(null, await req.json()) }));
