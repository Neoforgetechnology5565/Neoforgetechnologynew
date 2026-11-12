/** Tiny helpers for writing walkthrough configs compactly. */
import type { WtAction, WtConfig, WtStep } from "./schema";

export const a = (t: WtAction["t"], sel = "", value = "", allow = false): WtAction => ({ t, sel, value, allow });
export const ckAllow = (s: string) => a("click", s, "", true);
export const go = (s: string) => a("navigate", s), ck = (s: string) => a("click", s), tab = (s: string) => a("tab", s), smp = (s: string) => a("sample", s), hl = (s: string) => a("highlight", s), sc = (s: string) => a("scroll", s);
export const up = (s: string, url: string) => a("upload", s, url), wt = (s: string, ms = 8000) => a("wait", s, String(ms)), dd = (s: string, v: string) => a("dropdown", s, v);
export type Raw = [title: string, subtitle: string, target?: string, actions?: WtAction[], opts?: Partial<WtStep>];
export const steps = (raw: Raw[]): WtStep[] => raw.map(([title, subtitle, target = "", actions = [], opts = {}], i) => ({ id: `s${i + 1}`, title, subtitle, target, actions, durationMs: 5200, badge: "live", ...opts }));
export const cfg = (title: string, intro: string, completion: string, raw: Raw[], extra: Partial<WtConfig> = {}): WtConfig => ({ enabled: true, title, intro, introMs: 6500, completion, sandboxApi: false, steps: steps(raw), ...extra });
export const P = { badge: "prepared" as const };

