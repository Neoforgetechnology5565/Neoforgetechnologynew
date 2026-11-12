import { blockedRequest, blockReason, type ElInfo } from "@/lib/walkthrough/guard";
import { safePath, type WtAction, type WtConfig, type WtStep } from "@/lib/walkthrough/schema";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Issue { stepId: string; title: string; kind: "missing" | "blocked" | "error"; detail: string }
export type Status = "idle" | "intro" | "running" | "paused" | "done" | "stopped";
export type Mode = "auto" | "manual";
export interface RunnerState {
  status: Status; mode: Mode; index: number; total: number; title: string; subtitle: string; badge: "live" | "prepared"; rect: Rect | null;
  issues: Issue[]; skipped: number; blockedRequests: number; subtitlesOn: boolean; completion: string; intro: string; demoTitle: string; log: string[];
}

/* ---------- selectors ---------- */
const CLICKABLE = "button, a, [role=tab], [role=button], [role=menuitem], summary, label, h1, h2, h3, li, td, th, option";
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export const isVisible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(), w = el.ownerDocument.defaultView; if (!w) return false; const cs = w.getComputedStyle(el as HTMLElement); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none"; };
/** Resolves a target. Forms: `tour:id` (data-tour-id), `tid:id` (data-testid), `text:Label` (visible text of a button, tab, link or heading), or a plain CSS selector. */
export function resolve(doc: Document | HTMLElement, sel: string): HTMLElement | null {
  const s = sel.trim(); if (!s) return null;
  try {
    if (s.includes(" >> ")) { const [scope, rest] = [s.slice(0, s.indexOf(" >> ")), s.slice(s.indexOf(" >> ") + 4)], root = resolve(doc, scope); return root ? resolve(root, rest) : null; }
    if (s.startsWith("tour:")) return pickVisible(doc.querySelectorAll(`[data-tour-id="${CSS.escape(s.slice(5))}"]`));
    if (s.startsWith("tid:")) return pickVisible(doc.querySelectorAll(`[data-testid="${CSS.escape(s.slice(4))}"]`));
    for (const [pre, css] of [["tab:", "[role=tab]"], ["btn:", "button"], ["nav:", "nav button, nav a, header nav a"]] as const) {
      if (s.startsWith(pre)) { const want = norm(s.slice(pre.length)), all = [...doc.querySelectorAll<HTMLElement>(css)].filter(isVisible); return all.find((e) => norm(e.textContent || "") === want) ?? all.find((e) => norm(e.textContent || "").startsWith(want)) ?? all.find((e) => norm(e.textContent || "").includes(want)) ?? null; }
    }
    if (s.startsWith("text:")) {
      const want = norm(s.slice(5)), all = [...doc.querySelectorAll<HTMLElement>(CLICKABLE)].filter(isVisible);
      return all.find((e) => norm(e.textContent || "") === want || norm(e.getAttribute("aria-label") || "") === want) ?? all.find((e) => norm(e.textContent || "").includes(want) && (e.textContent || "").length < want.length * 4 + 20) ?? null;
    }
    return pickVisible(doc.querySelectorAll(s));
  } catch { return null; }
}
function pickVisible(list: NodeListOf<Element>): HTMLElement | null { const a = [...list] as HTMLElement[]; return a.find(isVisible) ?? null; }
export function describe(el: HTMLElement): ElInfo {
  return { text: (el.textContent || "").slice(0, 120), aria: el.getAttribute("aria-label") || "", title: el.getAttribute("title") || "", testid: el.getAttribute("data-testid") || "", id: el.id || "", type: (el as HTMLButtonElement).type || "", tag: el.tagName.toLowerCase(), insideForm: !!el.closest("form") };
}

/* ---------- guards on the demo window ---------- */
export function installGuards(win: Window & typeof globalThis, onBlocked: () => void, sandbox = false) {
  const w = win as Window & { __wtGuard?: boolean; XMLHttpRequest: typeof XMLHttpRequest }; if (w.__wtGuard) return; w.__wtGuard = true;
  const origin = win.location.origin, f = win.fetch.bind(win);
  win.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url, method = init?.method || (typeof input === "object" && "method" in input ? input.method : "GET");
    if (blockedRequest(method, url, origin, sandbox)) { onBlocked(); return Promise.resolve(new win.Response(JSON.stringify({ error: "Blocked during walkthrough" }), { status: 403, headers: { "content-type": "application/json" } })); }
    return f(input as RequestInfo, init);
  };
  const open = w.XMLHttpRequest.prototype.open, send = w.XMLHttpRequest.prototype.send;
  w.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __wt?: boolean }, m: string, u: string | URL, ...rest: unknown[]) { this.__wt = blockedRequest(m, String(u), origin, sandbox); return (open as (...a: unknown[]) => void).call(this, m, u, ...rest); };
  w.XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __wt?: boolean }, b?: Document | XMLHttpRequestBodyInit | null) { if (this.__wt) { onBlocked(); this.abort(); return; } return send.call(this, b); };
  if (win.navigator.sendBeacon) win.navigator.sendBeacon = () => { onBlocked(); return false; };
}

/* ---------- runner ---------- */
class Cancel extends Error {}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export interface RunnerOpts { getFrame: () => HTMLIFrameElement | null; config: WtConfig; demoTitle: string; demoPath: string; onState: (s: RunnerState) => void; loadPath: (path: string) => Promise<void>; actionDelayMs?: number; findWaitMs?: number; targetWaitMs?: number }

export class WalkthroughRunner {
  private st: RunnerState; private epoch = 0; private paused = false; private tracking: HTMLElement | null = null; private raf = 0; private dead = false; private blocked = 0;
  constructor(private o: RunnerOpts) {
    this.st = { status: "idle", mode: "auto", index: -1, total: o.config.steps.length, title: "", subtitle: "", badge: "live", rect: null, issues: [], skipped: 0, blockedRequests: 0, subtitlesOn: true, completion: o.config.completion, intro: o.config.intro, demoTitle: o.demoTitle, log: [] };
    this.loop();
  }
  get state() { return this.st; }
  private set(p: Partial<RunnerState>) { this.st = { ...this.st, ...p }; this.o.onState(this.st); }
  private log(m: string) { this.set({ log: [...this.st.log.slice(-60), m] }); }
  private doc() { return this.o.getFrame()?.contentDocument ?? null; }
  private win() { return (this.o.getFrame()?.contentWindow ?? null) as (Window & typeof globalThis) | null; }
  guard() { const w = this.win(); if (w) { try { installGuards(w, () => { this.blocked++; this.st = { ...this.st, blockedRequests: this.blocked }; this.o.onState(this.st); }, this.o.config.sandboxApi); } catch { /* cross-origin: nothing to guard */ } } }
  setSubtitles(on: boolean) { this.set({ subtitlesOn: on }); }

  /** Keeps the highlight on the tracked element as the demo scrolls, resizes or re-renders. */
  private loop = () => {
    if (this.dead) return;
    const el = this.tracking, d = this.doc();
    if (el && d && d.contains(el)) { const r = el.getBoundingClientRect(), p = this.st.rect, n = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; if (!p || Math.abs(p.x - n.x) > 1 || Math.abs(p.y - n.y) > 1 || Math.abs(p.w - n.w) > 1 || Math.abs(p.h - n.h) > 1) this.set({ rect: n }); }
    else if (this.st.rect && !el) this.set({ rect: null });
    this.raf = requestAnimationFrame(this.loop);
  };
  destroy() { this.dead = true; this.epoch++; cancelAnimationFrame(this.raf); }

  private async waitFor(sel: string, ms: number): Promise<HTMLElement | null> {
    const end = Date.now() + ms; for (;;) { const d = this.doc(), el = d ? resolve(d, sel) : null; if (el) return el; if (Date.now() >= end) return null; await this.tick(100); }
  }
  /** Sleep that honours pause and cancellation. */
  private async tick(ms: number, e = this.epoch) { let left = ms; while (left > 0) { await sleep(Math.min(100, left)); if (e !== this.epoch || this.dead) throw new Cancel(); if (!this.paused) left -= 100; } }
  private issue(step: WtStep, kind: Issue["kind"], detail: string) { this.set({ issues: [...this.st.issues, { stepId: step.id, title: step.title, kind, detail }] }); this.log(`${kind}: ${step.title}: ${detail}`); }

  private highlight(el: HTMLElement | null) { this.tracking = el; if (!el) this.set({ rect: null }); }
  private async show(el: HTMLElement) { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); this.highlight(el); await this.tick(250); }

  private async runAction(a: WtAction, step: WtStep) {
    const win = this.win(), d = this.doc(); if (!win || !d) return;
    if (a.t === "open") { if (!safePath(a.value)) return this.issue(step, "blocked", `path not allowed: ${a.value}`); await this.o.loadPath(a.value); this.guard(); return; }
    if (a.t === "wait") { const ms = Math.min(60000, Math.max(500, Number(a.value) || 8000)); const el = await this.waitFor(a.sel, ms); if (!el) this.issue(step, "missing", `"${a.sel}" did not appear within ${ms} ms`); else await this.show(el); return; }
    const el = await this.waitFor(a.sel, this.o.findWaitMs ?? 4000);
    if (!el) return this.issue(step, "missing", `${a.t}: "${a.sel}" not found`);
    if (a.t === "scroll" || a.t === "highlight") { await this.show(el); return; }
    const why = blockReason(describe(el), a.t, a.allow); if (why) { this.issue(step, "blocked", `${a.t} "${a.sel}" skipped: ${why}`); return; }
    await this.show(el);
    if (a.t === "dropdown") {
      if (el instanceof win.HTMLSelectElement) {
        const o = [...el.options].find((x) => x.value === a.value || norm(x.text) === norm(a.value)); if (!o) return this.issue(step, "missing", `dropdown option "${a.value}" not found`);
        Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value")!.set!.call(el, o.value); el.dispatchEvent(new win.Event("input", { bubbles: true })); el.dispatchEvent(new win.Event("change", { bubbles: true }));
      } else el.click();
      return;
    }
    if (a.t === "upload") {
      if (!(el instanceof win.HTMLInputElement) || el.type !== "file") return this.issue(step, "error", `upload target "${a.sel}" is not a file input`);
      if (!safePath(a.value)) return this.issue(step, "blocked", `path not allowed: ${a.value}`);
      const r = await fetch(a.value); if (!r.ok) return this.issue(step, "missing", `sample file ${a.value} returned ${r.status}`);
      const blob = await r.blob(), file = new win.File([blob], a.value.split("/").pop() || "sample", { type: blob.type }), dt = new win.DataTransfer(); dt.items.add(file);
      el.files = dt.files; el.dispatchEvent(new win.Event("input", { bubbles: true })); el.dispatchEvent(new win.Event("change", { bubbles: true })); return;
    }
    el.click(); // navigate | click | tab | sample | modal | report
  }

  /** Shows one step: highlight, subtitle, then its actions. Returns false when the step was skipped. */
  private async exec(i: number): Promise<boolean> {
    const step = this.o.config.steps[i]; this.set({ index: i, title: step.title, subtitle: step.subtitle, badge: step.badge });
    this.highlight(null);
    if (step.target) {
      const t = await this.waitFor(step.target, this.o.targetWaitMs ?? 10000);
      if (!t) { this.issue(step, "missing", `target "${step.target}" not found; step skipped`); this.set({ skipped: this.st.skipped + 1, subtitle: "", title: `${step.title} (skipped)` }); return false; }
      await this.show(t);
    }
    for (const a of step.actions) { try { await this.runAction(a, step); } catch (e) { if (e instanceof Cancel) throw e; this.issue(step, "error", `${a.t}: ${(e as Error).message}`); } await this.tick(this.o.actionDelayMs ?? 450); }
    return true;
  }

  private async hold(ms: number) { await this.tick(ms); }
  private async intro(e: number) { this.highlight(null); this.set({ status: "intro", index: -1, title: this.o.demoTitle, subtitle: this.o.config.intro, badge: "live" }); if (this.st.mode === "auto") await this.hold(this.o.config.introMs); void e; }
  private finish() { this.highlight(null); this.set({ status: "done", title: "Walkthrough complete", subtitle: this.o.config.completion, index: this.st.total }); }

  /* ----- controls ----- */
  async start(mode: Mode) {
    const e = ++this.epoch; this.paused = false; this.blocked = 0; this.set({ mode, issues: [], skipped: 0, blockedRequests: 0, log: [], status: "intro" });
    this.guard();
    try {
      if (!this.doc()) { this.issue({ id: "frame", title: "Demo", subtitle: "", durationMs: 1000, target: "", actions: [], badge: "live" }, "error", "the demo is not loaded"); return this.set({ status: "stopped" }); }
      await this.intro(e); if (mode === "auto") await this.play(0, e);
    } catch (x) { if (!(x instanceof Cancel)) throw x; }
  }
  private async play(from: number, e: number) {
    this.set({ status: "running" });
    for (let i = from; i < this.st.total; i++) {
      if (e !== this.epoch) return; const ran = await this.exec(i);
      if (ran) await this.hold(this.o.config.steps[i].durationMs);
    }
    if (e === this.epoch) this.finish();
  }
  pause() { if (this.st.status === "running" || this.st.status === "intro") { this.paused = true; this.set({ status: "paused" }); } }
  resume() { if (this.st.status === "paused") { this.paused = false; this.set({ status: this.st.index < 0 ? "intro" : "running" }); } }
  async goTo(i: number) {
    const e = ++this.epoch; this.paused = false; const n = Math.max(0, Math.min(this.st.total - 1, i));
    try {
      if (this.st.mode === "manual") { this.set({ status: "running" }); await this.exec(n); } else await this.play(n, e);
    } catch (x) { if (!(x instanceof Cancel)) throw x; }
  }
  next() { if (this.st.status === "done" || this.st.status === "idle" || this.st.status === "stopped") return; return this.st.index + 1 >= this.st.total ? (this.epoch++, this.finish()) : this.goTo(this.st.index + 1); }
  prev() { if (this.st.status === "idle") return; if (this.st.index <= 0) { this.epoch++; return this.set({ status: "intro", index: -1, title: this.o.demoTitle, subtitle: this.o.config.intro }); } return this.goTo(this.st.index - 1); }
  restart() { return this.start(this.st.mode); }
  stop() { this.epoch++; this.paused = false; this.highlight(null); this.set({ status: "stopped", subtitle: "", title: "", index: -1 }); }
}
