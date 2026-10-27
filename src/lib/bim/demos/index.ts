/** Dispatch of the eleven demonstrations onto their processors. */
import { runPlan3d, type InFile, type Stage } from "../pipeline";
import type { Plan3dModel } from "../pipeline-types";
import type { DemoKey } from "../suite-keys";
import { runCadAnalysis } from "./cad";
import { runCloud } from "./cloud";
import { floorplanExt } from "./floorplan";
import { interopExt } from "./interop";
import { mepExt } from "./mepcoord";
import { qcExt } from "./qc";
import { qtoExt } from "./qto";
import { runStructural } from "./structural";
import type { AnalysisModel } from "./types";
import { viewerExt } from "./viewer";

export type AnyModel = Plan3dModel | AnalysisModel;
export const isPlan3d = (m: AnyModel): m is Plan3dModel => m.kind === "plan3d";
/** Demonstrations whose model is the shared plan/IFC → 3D model with an analysis attached. */
export const PLAN_BASED: DemoKey[] = ["plan3d", "bim-viewer", "interop", "floorplan", "mep", "bim-qc", "qto"];
const asPlan = (files: InFile[]) => files.map((f) => ({ ...f, role: f.role === "mep" ? "mep" : "plan" }));

export async function runDemo(demo: DemoKey, files: InFile[], settings: Record<string, unknown>, stage: Stage, version: number, name = "project"): Promise<AnyModel> {
  const params = (settings.params ?? {}) as Record<string, unknown>;
  switch (demo) {
    case "plan3d": return runPlan3d(files, settings, stage, version);
    case "cad-analysis": return runCadAnalysis(files, settings, stage, version);
    case "point-cloud": return runCloud(files, settings, stage, version);
    case "structural": return runStructural(files, settings, stage, version);
    case "collab": throw new Error("Collaboration projects are reviewed in the review workspace; there is no batch processing step.");
    default: break;
  }
  const pf = asPlan(files); if (demo === "bim-viewer" || demo === "bim-qc") { const p = pf.find((f) => f.role === "plan"); if (!p) throw new Error("Upload an IFC file, or open a sample."); if (p.format !== "ifc") throw new Error(`This application reads IFC files. ${p.format.toUpperCase()} files can be converted to 3D in the plan-to-3D application.`); }
  const m = await runPlan3d(pf, settings, stage, version); stage("Analysing", demo);
  switch (demo) {
    case "bim-viewer": { const v = viewerExt(m); m.ext = v.ext; break; }
    case "bim-qc": m.ext = qcExt(m, params); break;
    case "floorplan": m.ext = floorplanExt(m, params); break;
    case "qto": m.ext = qtoExt(m, params); break;
    case "mep": m.ext = mepExt(m); break;
    case "interop": m.ext = await interopExt(m, name, files.map((f) => ({ name: f.name, format: f.format, sample: f.sample, size: f.buf.length }))); break;
  }
  return m;
}
export function modelSummary(m: AnyModel): Record<string, unknown> {
  const head = Object.fromEntries((m.ext?.headline ?? []).slice(0, 6).map((h) => [h.label, h.value]));
  if (isPlan3d(m)) return { version: m.version, generatedAt: m.generatedAt, walls: m.building?.stats.walls ?? 0, rooms: m.building?.stats.rooms ?? 0, mepElements: m.mep.elements.length, clashes: m.clashes.length, warnings: m.warnings.length, needsInput: m.needsInput.length, sample: m.sample, kind: m.kind, headline: head, findings: m.ext?.issues.length ?? 0 };
  return { version: m.version, generatedAt: m.generatedAt, warnings: m.warnings.length, needsInput: m.needsInput.length, sample: m.sample, kind: m.kind, headline: head, findings: m.ext.issues.length };
}
