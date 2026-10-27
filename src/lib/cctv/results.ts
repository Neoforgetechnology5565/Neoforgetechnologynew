import "server-only";
import { analyze } from "./analyze";
import { withIds } from "./eventid";
import { SAMPLE_MAP } from "./samples";
import { loadFrames, type JobDoc, publicJob } from "./server";
import type { Frame } from "./types";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Raw detections for a job: stored inference output, or the bundled reference annotations for a sample job. */
async function rawFrames(job: JobDoc): Promise<Frame[]> {
  if (job.mode === "reference" && job.source.id) {
    const s = SAMPLE_MAP[job.source.id];
    const j = JSON.parse(readFileSync(path.join(process.cwd(), "public", s.annotations), "utf8")) as { frames: Frame[] };
    return j.frames;
  }
  return loadFrames(job.id);
}
export async function loadAndAnalyze(job: JobDoc) {
  const raw = await rawFrames(job);
  const a = analyze(raw, job.settings, { durationSec: job.meta.durationSec });
  const events = withIds(job.id, a.events, job.reviews).map((e) => ({ ...e, note: job.notes?.[e.id] }));
  return { job: publicJob(job), frames: a.frames, tracks: a.tracks, events, stats: a.stats, rawFrames: raw.length };
}
