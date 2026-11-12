import { NextResponse } from "next/server";
import { adminRoute, HttpError } from "@/lib/auth";
import { configSchema, keyOk } from "@/lib/walkthrough/schema";
import { getRecord, resetRecord, saveRecord, storageAvailable } from "@/lib/walkthrough/server";

type P = { key: string };
const need = async (key: string) => { if (!keyOk(key)) throw new HttpError(400, "Bad key"); const r = await getRecord(key); if (!r) throw new HttpError(404, "Unknown demo"); return r; };

export const GET = adminRoute<P>(async (_req, { params }) => NextResponse.json(await need((await params).key)));
export const PUT = adminRoute<P>(async (req, { params }, user) => {
  const { key } = await params; await need(key);
  if (!storageAvailable()) throw new HttpError(503, "Saving is unavailable: storage is not configured on this server.");
  await saveRecord(key, configSchema.parse(await req.json()), user.email);
  return NextResponse.json(await need(key));
});
export const DELETE = adminRoute<P>(async (_req, { params }) => {
  const { key } = await params; await need(key);
  if (!storageAvailable()) throw new HttpError(503, "Storage is not configured on this server.");
  await resetRecord(key); return NextResponse.json(await need(key));
});
