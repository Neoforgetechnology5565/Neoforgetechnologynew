"use client";
/** In-browser replacement for services/ml-lab: the same endpoints and response shapes behind the same `mlApi` surface, so the ten demos run on any static host. */
import { MlApiError, type MlApi, type MlHealth } from "../api";
import { err, INFO, LIMITS, samples } from "./core";

const url = (p: string) => p.replace(/^\/api\/products\/([^/]+)\/image$/, "/ml/samples/products/$1.png");
type Handler = (f: FormData, q: URLSearchParams, m: RegExpMatchArray) => Promise<unknown> | unknown;
const lazy = <T,>(load: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= load()); };
const vision = lazy(() => import("./vision")), video = lazy(() => import("./video"));
const tabular = lazy(() => import("./tabular-api")), search = lazy(() => import("./search")), ocr = lazy(() => import("./ocr"));

const routes: { method: string; re: RegExp; h: Handler }[] = [
  { method: "POST", re: /^\/api\/classify$/, h: async (f) => (await vision()).classify(f) },
  { method: "POST", re: /^\/api\/detect\/image$/, h: async (f) => (await vision()).detectImage(f) },
  { method: "POST", re: /^\/api\/detect\/video$/, h: async (f) => (await video()).detectVideo(f) },
  { method: "POST", re: /^\/api\/pose\/image$/, h: async (f) => (await vision()).poseImage(f) },
  { method: "POST", re: /^\/api\/pose\/video$/, h: async (f) => (await video()).poseVideo(f) },
  { method: "GET", re: /^\/api\/jobs\/([0-9a-f]{32})$/, h: async (_f, _q, m) => (await video()).jobStatus(m[1]) },
  { method: "POST", re: /^\/api\/jobs\/([0-9a-f]{32})\/cancel$/, h: async (_f, _q, m) => (await video()).jobCancel(m[1]) },
  { method: "POST", re: /^\/api\/segment$/, h: async (f) => (await vision()).segment(f) },
  { method: "POST", re: /^\/api\/ocr$/, h: async (f) => (await ocr()).ocr(f) },
  { method: "POST", re: /^\/api\/tabular\/inspect$/, h: async (f) => (await tabular()).inspect(f) },
  { method: "POST", re: /^\/api\/forecast$/, h: async (f) => (await tabular()).forecast(f) },
  { method: "POST", re: /^\/api\/sensors$/, h: async (f) => (await tabular()).sensors(f) },
  { method: "GET", re: /^\/api\/search\/documents$/, h: async (_f, q) => (await search()).list(q.get("session") ?? "") },
  { method: "POST", re: /^\/api\/search\/documents$/, h: async (f) => (await search()).add(f) },
  { method: "DELETE", re: /^\/api\/search\/documents\/([^/?]+)$/, h: async (_f, q, m) => (await search()).remove(m[1], q.get("session") ?? "") },
  { method: "POST", re: /^\/api\/search\/reset$/, h: async (f) => (await search()).reset(f) },
  { method: "POST", re: /^\/api\/search\/query$/, h: async (f) => (await search()).query(f) },
  { method: "GET", re: /^\/api\/products$/, h: async (_f, q) => (await search()).products(q) },
  { method: "GET", re: /^\/api\/products\/([^/?]+)\/similar$/, h: async (_f, q, m) => (await search()).similar(m[1], q) },
];
async function call<T>(method: string, path: string, body?: FormData): Promise<T> {
  const [p, qs] = path.split("?"), q = new URLSearchParams(qs ?? "");
  for (const r of routes) { if (r.method !== method) continue; const m = p.match(r.re); if (m) { try { return (await r.h(body ?? new FormData(), q, m)) as T; } catch (e) { if (e instanceof MlApiError) throw e; throw new MlApiError(500, "The analysis failed in this browser."); } } }
  throw new MlApiError(404, "Unknown endpoint.");
}
export const browserMl = (): MlApi & { browser: true } => ({
  browser: true, url,
  health: async (): Promise<MlHealth> => ({ ok: true, models: INFO, available: { classifier: true, detector: true, segmenter: true, pose: true, ocr: true, search_vectors: true, catalogue: true, ffmpeg: false }, limits: LIMITS }),
  samples: async (kind?: string) => ({ samples: (await samples()).filter((s) => !kind || s.kind === kind) }),
  sampleUrl: (id: string) => { void err; return `/ml/samples/${(manifestFile(id))}`; },
  post: <T,>(path: string, body: FormData) => call<T>("POST", path, body), get: <T,>(path: string) => call<T>("GET", path), del: <T,>(path: string) => call<T>("DELETE", path),
} as never);
import { sampleFileOf } from "./core";
const manifestFile = (id: string) => sampleFileOf(id);
