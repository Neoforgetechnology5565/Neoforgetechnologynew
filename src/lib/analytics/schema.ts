import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
const sid = z.string().regex(/^[a-zA-Z0-9_-]{6,40}$/);
const path = z.string().max(300).refine((p) => p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/admin") && !p.startsWith("/api"), "not a public page path");
export const viewSchema = z.object({
  type: z.literal("view").optional(), path, vid: id, sid: sid.optional(), project: z.string().max(200).optional(),
  /** document.referrer reduced to its origin by the browser; only the host is used */
  ref: z.string().max(200).optional(), utm: z.object({ s: z.string().max(60).optional(), m: z.string().max(60).optional(), c: z.string().max(60).optional() }).optional(),
  tz: z.string().max(60).regex(/^[A-Za-z]+(\/[A-Za-z_+-]+)*$/).optional(), lang: z.string().max(20).regex(/^[A-Za-z0-9-]+$/).optional(),
});
export const clicksSchema = z.object({ type: z.literal("clicks"), vid: id, sid: sid.optional(), path, items: z.array(z.object({ l: z.string().max(80), k: z.enum(["link", "button", "other"]), h: z.string().max(120).optional() })).min(1).max(20) });
export const trackBody = z.union([clicksSchema, viewSchema]);
export type ViewBody = z.infer<typeof viewSchema>;
export type ClicksBody = z.infer<typeof clicksSchema>;
