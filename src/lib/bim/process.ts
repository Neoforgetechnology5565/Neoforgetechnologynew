import "server-only";
import { HttpError, type ProjectDoc, type JobMeta, deleteBlob, getBlob, putBlob, saveProject, stager } from "./server";
import type { InFile } from "./pipeline";
import type { Plan3dModel } from "./pipeline-types";
import { runDemo, modelSummary, isPlan3d, type AnyModel } from "./demos";

export const SETTINGS_HISTORY_MAX = 8;
export async function loadFiles(p: ProjectDoc): Promise<InFile[]> { return Promise.all(p.files.map(async (f) => ({ name: f.name, format: f.format, support: f.validation.support, role: f.role, sample: f.sample, buf: (await getBlob(f.blob)).data }))); }

/** (Re)generate the project's model from its stored source files and current settings. Stages are real and timed; a failure keeps the previous model. */
export async function processProject(p: ProjectDoc, settingsPatch?: Record<string, unknown>, replace = false): Promise<JobMeta> {
  const S = stager("generate");
  if (settingsPatch) { (p as ProjectDoc & { history?: unknown[] }).history = [...(((p as ProjectDoc & { history?: unknown[] }).history) ?? []), { version: p.version, at: Date.now(), settings: p.settings }].slice(-SETTINGS_HISTORY_MAX); p.settings = replace ? { ...settingsPatch } : { ...p.settings, ...settingsPatch}; }
  try {
    const files = await loadFiles(p); S.stage("Loaded stored files", `${files.length} file(s)`);
    const model: AnyModel = await runDemo(p.demo, files, p.settings, S.stage, p.version + 1, p.name);
    const json = Buffer.from(JSON.stringify(model)); const blob = await putBlob(json, { mime: "application/json" }); S.stage("Stored model", `${(json.length / 1024).toFixed(0)} KB of result data`);
    const old = p.modelBlob; p.modelBlob = blob; p.version += 1;
    p.modelMeta = modelSummary(model);
    if (old) await deleteBlob(old);
    const job = S.done({ ...p.modelMeta }); p.jobs = [job, ...p.jobs].slice(0, 20); await saveProject(p); return job;
  } catch (e) { const job = S.fail((e as Error).message || "Processing failed"); p.jobs = [job, ...p.jobs].slice(0, 20); await saveProject(p); return job; }
}
export async function loadAnyModel(p: ProjectDoc): Promise<AnyModel> { if (!p.modelBlob) throw new Error("No model has been generated yet."); return JSON.parse((await getBlob(p.modelBlob)).data.toString("utf8")) as AnyModel; }
/** The shared plan/IFC model; applications that produce an analysis without a building return a 422 here. */
export async function loadModel(p: ProjectDoc): Promise<Plan3dModel> { const m = await loadAnyModel(p); if (!isPlan3d(m)) throw new HttpError(422, "This operation is not available for this application's results."); return m; }

/** The model a request refers to: the latest, or the version named in the x-bim-version header (review projects). */
export async function modelFor(p: ProjectDoc, req: { headers: { get(n: string): string | null } }): Promise<Plan3dModel> {
  const vid = req.headers.get("x-bim-version"); if (!vid) return loadModel(p);
  const v = (p.versions ?? []).find((x) => x.id === vid); if (!v) throw new HttpError(404, "Version not found");
  return JSON.parse((await getBlob(v.modelBlob)).data.toString("utf8")) as Plan3dModel;
}
