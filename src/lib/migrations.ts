import "server-only";
import { adminDb, isFirebaseConfigured } from "./firebase-admin";
import { C, invalidate, toProject } from "./db";
import { DEFAULT_CATEGORIES, DIVISIONS } from "./divisions";
import { DEFAULT_FAQS } from "./defaults";
import { slugify } from "./utils";

/**
 * Idempotent, ordered migrations. The current version lives in meta/schema.
 * They run automatically whenever an admin opens the dashboard, and can be re-run
 * safely from Admin → Maintenance. Every step only creates what is missing.
 */
interface Migration {
  version: number;
  name: string;
  run: () => Promise<string>;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "Seed default sub-categories",
    async run() {
      const db = adminDb();
      let created = 0;
      for (const d of DIVISIONS) {
        const defaults = DEFAULT_CATEGORIES[d.slug];
        for (let i = 0; i < defaults.length; i++) {
          const [name, description] = defaults[i];
          const id = `${d.slug}--${slugify(name)}`;
          const ref = db.collection(C.categories).doc(id);
          try {
            await ref.create({ name, slug: slugify(name), division: d.slug, description, capabilities: [], enabled: true, order: i });
            created++;
          } catch (e) {
            if ((e as { code?: number }).code !== 6) throw e; // 6 = ALREADY_EXISTS
          }
        }
      }
      return `${created} categories created`;
    },
  },
  {
    version: 2,
    name: "Seed starter FAQs",
    async run() {
      const col = adminDb().collection(C.faqs);
      if (!(await col.limit(1).get()).empty) return "FAQs already present";
      const batch = adminDb().batch();
      DEFAULT_FAQS.forEach((f, i) => batch.set(col.doc(`default-${i + 1}`), { ...f, order: i, enabled: true }));
      await batch.commit();
      return `${DEFAULT_FAQS.length} FAQs created`;
    },
  },
  {
    version: 3,
    name: "Backfill project fields",
    async run() {
      const snap = await adminDb().collection(C.projects).get();
      const batch = adminDb().batch();
      let n = 0;
      for (const doc of snap.docs) {
        const full = toProject(doc.id, doc.data());
        const { id: _id, ...rest } = full;
        void _id;
        const missing = Object.keys(rest).some((k) => doc.data()[k] === undefined);
        if (missing) {
          batch.set(doc.ref, rest, { merge: true });
          n++;
        }
      }
      if (n) await batch.commit();
      return `${n} projects updated`;
    },
  },
  {
    version: 4,
    name: "Backfill project category slugs",
    async run() {
      const db = adminDb();
      const [cats, projects] = await Promise.all([db.collection(C.categories).get(), db.collection(C.projects).get()]);
      const slugById = new Map(cats.docs.map((c) => [c.id, c.data().slug as string]));
      const batch = db.batch();
      let n = 0;
      for (const p of projects.docs) {
        const want = slugById.get(p.data().categoryId) ?? "";
        if (want && p.data().categorySlug !== want) { batch.update(p.ref, { categorySlug: want }); n++; }
      }
      if (n) await batch.commit();
      return `${n} projects updated`;
    },
  },
  {
    version: 5,
    name: "Fill blank descriptions on default categories",
    async run() {
      const db = adminDb();
      const batch = db.batch();
      let n = 0;
      for (const d of DIVISIONS) {
        for (const [name, description] of DEFAULT_CATEGORIES[d.slug]) {
          const ref = db.collection(C.categories).doc(`${d.slug}--${slugify(name)}`);
          const snap = await ref.get();
          if (snap.exists && !snap.data()?.description) { batch.update(ref, { description }); n++; } // never overwrites edited text
        }
      }
      if (n) await batch.commit();
      return `${n} descriptions filled`;
    },
  },
];

export const LATEST_SCHEMA = migrations[migrations.length - 1].version;

export async function runMigrations(force = false): Promise<{ from: number; to: number; log: string[] }> {
  if (!isFirebaseConfigured()) return { from: 0, to: 0, log: ["Firebase is not configured"] };
  const ref = adminDb().collection(C.meta).doc("schema");
  const current = ((await ref.get()).data()?.version as number | undefined) ?? 0;
  const log: string[] = [];
  if (!force && current >= LATEST_SCHEMA) return { from: current, to: current, log };
  let version = force ? 0 : current;
  for (const m of migrations) {
    if (m.version <= version) continue;
    log.push(`v${m.version} ${m.name}: ${await m.run()}`);
    version = m.version;
    await ref.set({ version, updatedAt: Date.now() }, { merge: true });
  }
  if (force) await ref.set({ version: LATEST_SCHEMA, updatedAt: Date.now() }, { merge: true });
  // revalidate* is not allowed during render (auto-run from the admin layout); caches expire on their own.
  if (force) invalidate();
  return { from: current, to: LATEST_SCHEMA, log };
}
