/** In-memory stand-in for the parts of Firestore the analytics code uses. For tests only. */
import type { Db, DocRef, QueryLike } from "./process";

type Data = Record<string, unknown>;
export const fakeInc = (n: number) => ({ __inc: n });
export const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const merge = (cur: Data, d: Data) => { for (const [k, v] of Object.entries(d)) { if (v && typeof v === "object" && "__inc" in v) cur[k] = ((cur[k] as number) ?? 0) + (v as { __inc: number }).__inc; else if (v && typeof v === "object" && !Array.isArray(v)) { cur[k] = merge((cur[k] as Data) ?? {}, v as Data); } else cur[k] = v; } return cur; };
export function fakeDb(): Db & { all: Map<string, Map<string, Data>> } {
  const all = new Map<string, Map<string, Data>>(), coll = (n: string) => { if (!all.has(n)) all.set(n, new Map()); return all.get(n)!; };
  const ref = (n: string, id: string): DocRef => ({ get: async () => ({ exists: coll(n).has(id), data: () => coll(n).get(id) }), set: async (d, o) => { coll(n).set(id, o?.merge ? merge(structuredClone(coll(n).get(id) ?? {}), d) : d); }, delete: async () => { coll(n).delete(id); } });
  const q = (n: string, filters: ((d: Data) => boolean)[] = [], order: [string, string] | null = null, lim = 1e9): QueryLike => ({
    orderBy: (f, dir = "asc") => q(n, filters, [f, dir], lim), limit: (x) => q(n, filters, order, x), where: (f, op, v) => q(n, [...filters, (d) => (d[f] !== undefined && (op === "<" ? (d[f] as number) < (v as number) : op === ">" ? (d[f] as number) > (v as number) : d[f] === v))], order, lim),
    get: async () => { let docs = [...coll(n).entries()].filter(([, d]) => filters.every((f) => f(d))); if (order) docs = docs.filter(([, d]) => d[order[0]] !== undefined).sort((a, b) => ((a[1][order[0]] as number) - (b[1][order[0]] as number)) * (order[1] === "desc" ? -1 : 1)); return { docs: docs.slice(0, lim).map(([id, d]) => ({ id, data: () => d, ref: ref(n, id) })) }; },
  });
  return { all, collection: (n: string) => ({ ...q(n), doc: (id: string) => ref(n, id) }) } as Db & { all: Map<string, Map<string, Data>> };
}
