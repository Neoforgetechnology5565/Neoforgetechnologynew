/** Groups a page path into what visitors were interested in: a service, a portfolio project, a demo, a blog post, or just a page. */
export type PageKind = "service" | "project" | "demo" | "blog" | "page";
export interface PageInfo { kind: PageKind; key: string }
const DEMO_ROOTS = ["ai-demos", "erp-demos", "demos", "cad-bim-suite"];
export function classifyPath(path: string): PageInfo {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/", seg = p.split("/").filter(Boolean);
  if (seg[0] === "services" && seg[1]) return { kind: "service", key: seg[1] };
  if (DEMO_ROOTS.includes(seg[0]) && seg[1]) return { kind: "demo", key: `${seg[0]}/${seg[1]}` };
  if (seg[0] === "blog" && seg[1]) return { kind: "blog", key: seg[1] };
  if (seg[0] === "portfolio" && seg.length === 3) return { kind: "project", key: `${seg[1]}/${seg[2]}` };
  if (["computer-vision", "crm-hrm-erp", "cad-bim"].includes(seg[0]) && seg.length === 3) return { kind: "project", key: `${seg[0]}/${seg[2]}` };
  return { kind: "page", key: p };
}
/** Map keys must be safe Firestore field names; this keeps letters, digits, _ ~ and -. */
export const mapKey = (s: string, n = 90) => s.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_~-]/g, "").slice(0, n) || "_";
export const pathKey = (p: string) => p.replace(/\//g, "~").replace(/[^a-zA-Z0-9_~-]/g, "").slice(0, 120) || "~";
export const unPathKey = (k: string) => (k === "~" ? "/" : k.replaceAll("~", "/"));
