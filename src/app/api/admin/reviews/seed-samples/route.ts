import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/auth";
import { seedSampleTestimonials } from "@/lib/db";

/** One-time import of the 20 built-in illustrative testimonials so they can be edited, hidden or deleted in Admin → Reviews. */
export const POST = adminRoute(async () => NextResponse.json({ added: await seedSampleTestimonials() }));
