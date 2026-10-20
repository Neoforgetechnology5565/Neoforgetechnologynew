import { NextResponse } from "next/server";
import webpush from "web-push";
import { adminRoute } from "@/lib/auth";
import { pushConfigured } from "@/lib/push";

export const GET = adminRoute(async () => NextResponse.json({ configured: pushConfigured() }));

/** Generates a fresh VAPID key pair to copy into Vercel (shown once; the private key is never stored by the site). */
export const POST = adminRoute(async () => NextResponse.json(webpush.generateVAPIDKeys()));
