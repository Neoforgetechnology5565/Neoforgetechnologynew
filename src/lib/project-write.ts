import "server-only";
import { HttpError } from "./auth";
import { C, invalidate } from "./db";
import { adminDb } from "./firebase-admin";
import { projectSchema } from "./schemas";
import { slugify } from "./utils";

/** Validates, de-duplicates the slug within the division, denormalises the category name, then writes. */
export async function saveProject(id: string | null, body: unknown): Promise<string> {
  const data = projectSchema.parse(body);
  const db = adminDb();

  let categoryName = "";
  if (data.categoryId) {
    const cat = await db.collection(C.categories).doc(data.categoryId).get();
    if (!cat.exists) throw new HttpError(400, "Unknown category");
    if (cat.data()!.division !== data.division) throw new HttpError(400, "Category belongs to a different division");
    categoryName = cat.data()!.name;
  }

  const slug = slugify(data.slug || data.title);
  if (!slug) throw new HttpError(400, "Invalid title/slug");
  const clash = await db.collection(C.projects).where("slug", "==", slug).get();
  if (clash.docs.some((d) => d.id !== id && d.data().division === data.division)) {
    throw new HttpError(409, "Another project in this division already uses that URL slug");
  }

  const now = Date.now();
  const ref = id ? db.collection(C.projects).doc(id) : db.collection(C.projects).doc();
  if (id) {
    const existing = await ref.get();
    if (!existing.exists) throw new HttpError(404, "Not found");
    await ref.set({ ...data, slug, categoryName, createdAt: existing.data()!.createdAt ?? now, updatedAt: now });
  } else {
    await ref.set({ ...data, slug, categoryName, createdAt: now, updatedAt: now });
  }
  invalidate();
  return ref.id;
}
