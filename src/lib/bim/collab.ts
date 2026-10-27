import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { z } from "zod";
import { readIfc } from "./ifcread";
import { runPlan3d } from "./pipeline";
import type { Plan3dModel } from "./pipeline-types";
import { toCsv } from "./csv";
import { HttpError, getBlob, newId, putBlob, type ActivityRec, type ProjectDoc, type VersionMeta } from "./server";

export const C_ISSUES = "bim_issues";
export const STATUSES = ["open", "in-progress", "resolved", "closed"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const TYPES = ["clash", "design", "rfi", "qc", "coordination", "other"] as const;
export const LIMITS = { versions: 8, issues: 300, comments: 200, views: 40, shares: 10 } as const;
const v3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const viewpointSchema = z.object({ cam: z.object({ pos: v3, target: v3, ortho: z.boolean() }), section: z.object({ on: z.boolean(), axis: z.enum(["elevation", "x", "y"]), offset: z.number().finite(), flip: z.boolean() }).optional(), hiddenCats: z.array(z.string().max(40)).max(40).optional(), vis: z.record(z.string().max(30), z.union([z.boolean(), z.string().max(40)])).refine((o) => Object.keys(o).length <= 40, "too many keys").optional(), selected: z.string().max(60).optional() });
export type Viewpoint = z.infer<typeof viewpointSchema>;
const text = (n: number) => z.string().trim().max(n);
/** Issue fields carry no defaults here: zod 4 applies a field's default even inside .partial(), which would reset untouched fields on every PATCH. Defaults are applied for creation only. */
const issueFields = { title: text(140).min(3), description: text(4000), type: z.enum(TYPES), priority: z.enum(PRIORITIES), status: z.enum(STATUSES), assignee: text(60), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), labels: z.array(text(30)).max(10), elements: z.array(z.object({ guid: text(40), id: text(30).optional(), label: text(120) })).max(20), versionId: text(40), viewpoint: viewpointSchema };
export const issueCreate = z.object(issueFields).partial().required({ title: true }).transform((b) => ({ description: "", type: "other" as const, priority: "medium" as const, status: "open" as const, assignee: "", due: "", labels: [] as string[], elements: [] as { guid: string; id?: string; label: string }[], ...b }));
export const issuePatch = z.object(issueFields).partial().strict();
export const commentSchema = z.object({ text: text(2000).min(1) });
export const viewSchema = z.object({ name: text(60).min(1), versionId: text(40).optional(), viewpoint: viewpointSchema });
export interface Comment { id: string; author: string; text: string; at: number }
export interface Hist { at: number; by: string; field: string; from: string; to: string }
export interface Issue { kind: "issue"; id: string; projectId: string; number: number; title: string; description: string; type: string; priority: string; status: string; assignee: string; due: string; labels: string[]; elements: { guid: string; id?: string; label: string }[]; versionId?: string; viewpoint?: Viewpoint; comments: Comment[]; history: Hist[]; reporter: string; createdAt: number; updatedAt: number; sample: boolean }
export interface SavedView { kind: "view"; id: string; projectId: string; name: string; versionId?: string; viewpoint: Viewpoint; by: string; createdAt: number }
const col = () => adminDb().collection(C_ISSUES);

export async function listIssues(projectId: string): Promise<Issue[]> { const s = await col().where("projectId", "==", projectId).where("kind", "==", "issue").get(); return s.docs.map((d) => d.data() as Issue).sort((a, b) => b.number - a.number); }
export async function getIssue(projectId: string, id: string): Promise<Issue> { const d = await col().doc(id).get(); const i = d.data() as Issue | undefined; if (!d.exists || !i || i.projectId !== projectId || i.kind !== "issue") throw new HttpError(404, "Issue not found"); return i; }
export const saveIssue = (i: Issue) => col().doc(i.id).set(i);
export async function listViews(projectId: string): Promise<SavedView[]> { const s = await col().where("projectId", "==", projectId).where("kind", "==", "view").get(); return s.docs.map((d) => d.data() as SavedView).sort((a, b) => b.createdAt - a.createdAt); }
export const saveView = (v: SavedView) => col().doc(v.id).set(v);
export async function getView(projectId: string, id: string): Promise<SavedView> { const d = await col().doc(id).get(); const v = d.data() as SavedView | undefined; if (!d.exists || !v || v.projectId !== projectId || v.kind !== "view") throw new HttpError(404, "Saved view not found"); return v; }
export const deleteDoc = (id: string) => col().doc(id).delete();
export const log = (p: ProjectDoc, by: string, action: string, detail: string) => { const a: ActivityRec = { at: Date.now(), by, action, detail: detail.slice(0, 200) }; p.activity = [a, ...(p.activity ?? [])].slice(0, 150); };
export const nextNumber = (p: ProjectDoc) => { const n = ((p as ProjectDoc & { issueSeq?: number }).issueSeq ?? 0) + 1; (p as ProjectDoc & { issueSeq?: number }).issueSeq = n; return n; };

/** Process an uploaded IFC as a new version of the reviewed model. */
export async function addVersion(p: ProjectDoc, fileId: string, label: string, note: string, by: string): Promise<VersionMeta> {
  if ((p.versions ?? []).length >= LIMITS.versions) throw new HttpError(409, `A project can hold ${LIMITS.versions} versions. Delete the project or start a new one.`);
  const f = p.files.find((x) => x.id === fileId); if (!f) throw new HttpError(404, "Upload the IFC file first, then register it as a version.");
  if (f.format !== "ifc") throw new HttpError(422, "Versions are IFC files. Convert other formats to IFC first (the plan-to-3D application can write IFC from a DXF).");
  if ((p.versions ?? []).some((v) => v.fileId === fileId)) throw new HttpError(409, "This file is already a version.");
  const buf = (await getBlob(f.blob)).data; const ifc = await readIfc(buf, { withMeshes: false }); void ifc;
  const model = await runPlan3d([{ name: f.name, format: "ifc", support: f.validation.support, role: "plan", sample: f.sample, buf }], {}, () => {}, (p.versions ?? []).length + 1);
  const blob = await putBlob(Buffer.from(JSON.stringify(model)), { mime: "application/json" });
  const v: VersionMeta = { id: newId(), label: label || `Version ${(p.versions ?? []).length + 1}`, note, fileId, fileName: f.name, uploadedAt: Date.now(), by, elements: model.ifc?.elements.length ?? 0, triangles: model.ifc?.triangles ?? 0, schema: model.ifc?.schema ?? "", modelBlob: blob, sample: f.sample };
  p.versions = [...(p.versions ?? []), v]; p.modelBlob = blob; p.version += 1; p.modelMeta = { version: p.version, kind: "plan3d", generatedAt: model.generatedAt, sample: model.sample, warnings: model.warnings.length, needsInput: 0, headline: { Versions: p.versions.length, Elements: v.elements }, findings: 0 };
  log(p, by, "version", `${v.label} (${v.fileName}, ${v.elements} elements)`); return v;
}
export async function loadVersionModel(v: VersionMeta): Promise<Plan3dModel> { return JSON.parse((await getBlob(v.modelBlob)).data.toString("utf8")) as Plan3dModel; }

export function reportCsv(issues: Issue[]) { return toCsv([["No.", "Title", "Type", "Priority", "Status", "Assignee", "Reporter", "Due", "Labels", "Elements", "Version", "Comments", "Created", "Updated", "Description"], ...issues.map((i) => [i.number, i.title, i.type, i.priority, i.status, i.assignee, i.reporter, i.due, i.labels.join("; "), i.elements.map((e) => e.label).join("; "), i.versionId ?? "", i.comments.length, new Date(i.createdAt).toISOString(), new Date(i.updatedAt).toISOString(), i.description])]); }
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function reportHtml(p: ProjectDoc, issues: Issue[]) {
  const by = (k: keyof Issue) => Object.entries(issues.reduce<Record<string, number>>((o, i) => ((o[String(i[k])] = (o[String(i[k])] ?? 0) + 1), o), {})).map(([a, b]) => `${esc(a)}: ${b}`).join(" · ");
  return `<!doctype html><meta charset="utf-8"><title>${esc(p.name)} - review report</title><style>body{font:15px/1.5 Georgia,serif;max-width:980px;margin:2rem auto;padding:0 1rem;color:#1c1917}table{border-collapse:collapse;width:100%;font-size:13px;margin:.5rem 0 1.5rem}th,td{border:1px solid #d6d3d1;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f5f5f4}.n{color:#57534e}</style>
<h1>${esc(p.name)} - model review report</h1><p class="n">Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${p.sampleOnly ? " - <b>SAMPLE DATA</b>" : ""}. Issues are records created by project members; this report does not assess the model.</p>
<h2>Versions</h2><table><thead><tr><th>#</th><th>Label</th><th>File</th><th>Elements</th><th>Added by</th><th>Date</th><th>Note</th></tr></thead><tbody>${(p.versions ?? []).map((v, i) => `<tr><td>${i + 1}</td><td>${esc(v.label)}</td><td>${esc(v.fileName)}</td><td>${v.elements}</td><td>${esc(v.by)}</td><td>${new Date(v.uploadedAt).toISOString().slice(0, 10)}</td><td>${esc(v.note)}</td></tr>`).join("")}</tbody></table>
<h2>Summary</h2><p>${issues.length} issue(s). Status - ${by("status")}. Priority - ${by("priority")}. Type - ${by("type")}.</p>
<h2>Issues</h2><table><thead><tr><th>No.</th><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th><th>Elements</th><th>Comments</th></tr></thead><tbody>${issues.map((i) => `<tr><td>${i.number}</td><td>${esc(i.title)}<br><span class="n">${esc(i.description)}</span></td><td>${esc(i.status)}</td><td>${esc(i.priority)}</td><td>${esc(i.assignee)}</td><td>${esc(i.due)}</td><td>${esc(i.elements.map((e) => e.label).join("; "))}</td><td>${i.comments.map((c) => `<b>${esc(c.author)}</b>: ${esc(c.text)}`).join("<br>")}</td></tr>`).join("")}</tbody></table>
<h2>Activity</h2><ul>${(p.activity ?? []).slice(0, 60).map((a) => `<li>${new Date(a.at).toISOString().slice(0, 16).replace("T", " ")} - ${esc(a.by)} - ${esc(a.action)}: ${esc(a.detail)}</li>`).join("")}</ul>`;
}

/** Sample review project: registers both bundled IFC revisions as versions and creates three clearly labelled sample issues about the known differences. */
export async function seedCollabSample(p: ProjectDoc) {
  const labels = ["Revision A - issued for review", "Revision B - after design changes"]; const vs: VersionMeta[] = [];
  for (const [i, f] of p.files.filter((x) => x.format === "ifc").entries()) vs.push(await addVersion(p, f.id, labels[i] ?? `Revision ${i + 1}`, i ? "Bundled synthetic revision with a deleted window, a widened door and an added column." : "Bundled synthetic baseline.", "Sample"));
  if (vs.length < 2) return; const B = await loadVersionModel(vs[1]); const el = (n: string) => B.ifc?.elements.find((e) => e.name === n); const A = await loadVersionModel(vs[0]); const ea = (n: string) => A.ifc?.elements.find((e) => e.name === n);
  const mk = async (b: { title: string; description?: string; type?: string; priority?: string }, els: { guid: string; id?: string; label: string }[], status: string, assignee: string) => { const now = Date.now(); const i: Issue = { kind: "issue", id: newId(), projectId: p.id, number: nextNumber(p), title: b.title, description: b.description ?? "", type: b.type ?? "other", priority: b.priority ?? "medium", status, assignee, due: "", labels: ["sample"], elements: els, versionId: vs[1].id, comments: [], history: [{ at: now, by: "Sample", field: "created", from: "", to: status }], reporter: "Sample", createdAt: now, updatedAt: now, sample: true }; await saveIssue(i); };
  const win = ea("O009"), door = el("O011"), col = el("C98");
  await mk({ title: "Window O009 is missing in revision B", description: "The bedroom window present in revision A no longer exists in revision B. Confirm the deletion was intended (daylight and ventilation).", type: "design", priority: "medium" }, win ? [{ guid: win.guid, id: `#${win.id}`, label: "Window O009 (revision A)" }] : [], "open", "Architect");
  await mk({ title: "Door O011 widened to 1.10 m: confirm clear width and fire rating", description: "The entrance door grew by 100 mm. Check the opening, the fire rating (FireRating is empty in the file) and the door schedule.", type: "rfi", priority: "high" }, door ? [{ guid: door.guid, id: `#${door.id}`, label: "Door O011" }] : [], "in-progress", "Door supplier");
  await mk({ title: "New column C98 in the living area needs structural review", description: "A column appears in revision B with no structural note. Coordinate with the engineer.", type: "coordination", priority: "low" }, col ? [{ guid: col.guid, id: `#${col.id}`, label: "Column C98" }] : [], "open", "Structural engineer");
  log(p, "Sample", "issues", "3 sample issues created");
}
