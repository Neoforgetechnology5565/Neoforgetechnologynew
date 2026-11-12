/** Walkthrough configuration shared by the admin API, the editor and the player. Admin-only feature: nothing here is imported by public pages. */
import { z } from "zod";

export const ACTION_TYPES = ["navigate", "click", "tab", "dropdown", "scroll", "sample", "upload", "highlight", "modal", "report", "wait", "open"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const ACTION_HELP: Record<ActionType, string> = {
  navigate: "Go to a section (clicks a navigation item)", click: "Click a button", tab: "Open a tab", dropdown: "Choose an option in a dropdown (value = option value or label)", scroll: "Scroll an element into view",
  sample: "Select a bundled sample file or sample result", upload: "Put a bundled sample file into a file input (value = path such as /ml/samples/chelsea.jpg)", highlight: "Highlight a chart, panel or result", modal: "Open a modal or dialog", report: "Open a report or results view",
  wait: "Wait until an element appears (for example a result)", open: "Load another page of the demo in the stage (value = path starting with /)",
};

/** Paths a step may load or fetch: same-origin, never the admin area or the API. */
export const safePath = (p: string) => /^\/(?!\/)/.test(p) && !/^\/(admin|api)(\/|$|\?)/.test(p) && !/[\s\\]/.test(p) && !/^\/\.\./.test(p);

export const actionSchema = z.object({
  t: z.enum(ACTION_TYPES),
  sel: z.string().trim().max(300).default(""),
  value: z.string().trim().max(300).default(""),
  /** Click even though the label looks like a change (for example "Import sample model" in a demo that only reads a bundled file). Delete, send, pay and publish labels are still refused. */
  allow: z.boolean().default(false),
}).superRefine((a, ctx) => {
  if ((a.t === "upload" || a.t === "open") && !safePath(a.value)) ctx.addIssue({ code: "custom", path: ["value"], message: "Must be a path on this site starting with /, and not under /admin or /api" });
  if (a.t !== "open" && a.t !== "wait" && !a.sel && a.t !== "navigate") ctx.addIssue({ code: "custom", path: ["sel"], message: "A target is required" });
});

export const stepSchema = z.object({
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(400).default(""),
  /** How long the subtitle stays up in the automated walkthrough (ms). */
  durationMs: z.number().int().min(1000).max(60000).default(5000),
  /** Element to highlight: CSS selector, tour:id, tid:testid, text:label, tab:label, btn:label, nav:label, or "scope >> selector". */
  target: z.string().trim().max(300).default(""),
  actions: z.array(actionSchema).max(8).default([]),
  /** live: the real demo is running. prepared: a bundled sample or presentation state, not a fresh processing result. */
  badge: z.enum(["live", "prepared"]).default("live"),
});

export const configSchema = z.object({
  enabled: z.boolean().default(true),
  title: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(600).default(""),
  introMs: z.number().int().min(1500).max(30000).default(6000),
  completion: z.string().trim().max(400).default("Walkthrough complete."),
  /** Let the demo create its own anonymous sample project (POST/PUT/PATCH to /api/bim or /api/cctv only). Everything else that writes stays blocked. */
  sandboxApi: z.boolean().default(false),
  steps: z.array(stepSchema).max(60),
}).superRefine((c, ctx) => { const ids = c.steps.map((s) => s.id); ids.forEach((id, i) => { if (ids.indexOf(id) !== i) ctx.addIssue({ code: "custom", path: ["steps", i, "id"], message: "Step ids must be unique" }); }); });

export type WtAction = z.infer<typeof actionSchema>;
export type WtStep = z.infer<typeof stepSchema>;
export type WtConfig = z.infer<typeof configSchema>;

export interface DemoEntry { key: string; no: string; title: string; group: "Computer Vision & AI" | "CRM / HRM / ERP" | "CAD / BIM"; family: string; appPath: string; summary: string; features: string[]; honest: string }
/** verified: every step was run against the real interface. partial: the start screen was verified, later steps need a server back-end that was not available for checking. draft: generated from the demo's description. */
export type Quality = "verified" | "partial" | "draft";
export type ConfigSource = "default" | "custom";
export interface ConfigRecord { key: string; config: WtConfig; source: ConfigSource; /** verified = selectors were checked against the real interface; draft = generated from the demo's description and still to be reviewed */ quality: Quality; updatedAt?: number; updatedBy?: string }
export const keyOk = (k: string) => /^[a-z0-9][a-z0-9-]{2,100}$/.test(k);
