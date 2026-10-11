import "server-only";
import { HttpError } from "./auth";
import { C, invalidate } from "./db";
import { adminDb } from "./firebase-admin";
import { postSchema } from "./schemas";
import { slugify } from "./utils";

/** Validates, keeps the slug unique, stamps publishedAt the first time a post goes live, then writes. */
export async function savePost(id: string | null, body: unknown): Promise<string> {
  const data = postSchema.parse(body);
  const db = adminDb();
  const slug = slugify(data.slug || data.title);
  if (!slug) throw new HttpError(400, "Invalid title/slug");
  const clash = await db.collection(C.posts).where("slug", "==", slug).get();
  if (clash.docs.some((d) => d.id !== id)) throw new HttpError(409, "Another article already uses that URL slug");

  const now = Date.now();
  const ref = id ? db.collection(C.posts).doc(id) : db.collection(C.posts).doc();
  const existing = id ? await ref.get() : null;
  if (id && !existing?.exists) throw new HttpError(404, "Not found");
  const prev = existing?.data();
  const publishedAt = data.status === "published" ? prev?.publishedAt || now : prev?.publishedAt || 0;
  await ref.set({ ...data, slug, publishedAt, createdAt: prev?.createdAt ?? now, updatedAt: now });
  invalidate();
  return ref.id;
}
