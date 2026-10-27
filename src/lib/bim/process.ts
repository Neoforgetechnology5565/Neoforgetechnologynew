import "server-only";
import { type ProjectDoc, type JobMeta, deleteBlob, getBlob, putBlob, saveProject, stager } from "./server";
import { runPlan3d, type InFile } from "./pipeline";
import type { Plan3dModel } from "./pipeline-types";

export const SETTINGS_HISTORY_MAX = 8;
export async function loadFiles(p: ProjectDoc): Promise<InFile[]> { return Promise.all(p.files.map(async (f) => ({ name: f.name, format: f.format, support: f.validation.support, role: f.role, sample: f.sample, buf: (await getBlob(f.blob)).data }))); }

/** (Re)generate the project's model from its stored source files and current settings. Stages are real and timed; a failure keeps the previous model. */
export async function processProject(p: ProjectDoc, settingsPatch?: Record<string, unknown>, replace = false): Promise<JobMeta> {
  const S = stager("generate");
  if (settingsPatch) { (p as ProjectDoc & { history?: unknown[] }).history = [...(((p as ProjectDoc & { history?: unknown[] }).history) ?? []), { version: p.version, at: Date.now(), settings: p.settings }].slice(-SETTINGS_HISTORY_MAX); p.settings = replace ? { ...settingsPatch } : { ...p.settings, ...settingsPatch}; }
  try {
    const files = await loadFiles(p); S.stage("Loaded stored files", `${files.length} file(s)`);
    if (p.demo !== "plan3d") throw new Error(`Processing for the "${p.demo}" application is not available yet.`);
    const model: Plan3dModel = await runPlan3d(files, p.settings, S.stage, p.version + 1);
    const blob = await putBlob(Buffer.from(JSON.stringify(model)), { mime: "application/json" }); S.stage("Stored model", `${(Buffer.byteLength(JSON.stringify(model.meshes)) / 1024).toFixed(0)} KB of meshes`);
    const old = p.modelBlob; p.modelBlob = blob; p.version += 1;
    p.modelMeta = { version: p.version, generatedAt: model.generatedAt, walls: model.building?.stats.walls ?? 0, rooms: model.building?.stats.rooms ?? 0, mepElements: model.mep.elements.length, clashes: model.clashes.length, warnings: model.warnings.length, needsInput: model.needsInput.length, sample: model.sample };
    if (old) await deleteBlob(old);
    const job = S.done({ ...p.modelMeta }); p.jobs = [job, ...p.jobs].slice(0, 20); await saveProject(p); return job;
  } catch (e) { const job = S.fail((e as Error).message || "Processing failed"); p.jobs = [job, ...p.jobs].slice(0, 20); await saveProject(p); return job; }
}
export async function loadModel(p: ProjectDoc): Promise<Plan3dModel> { if (!p.modelBlob) throw new Error("No model has been generated yet."); return JSON.parse((await getBlob(p.modelBlob)).data.toString("utf8")) as Plan3dModel; }
