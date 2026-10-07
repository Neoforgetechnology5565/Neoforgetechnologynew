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
        const names = DEFAULT_CATEGORIES[d.slug];
        for (let i = 0; i < names.length; i++) {
          const id = `${d.slug}--${slugify(names[i])}`;
          const ref = db.collection(C.categories).doc(id);
          try {
            await ref.create({ name: names[i], slug: slugify(names[i]), division: d.slug, description: "", capabilities: [], enabled: true, order: i });
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
