"use client";
import { useEffect, useRef, useState } from "react";
import type { Branding } from "@/lib/types";
import { saveUrl, form, type Sample } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, GO, H3, MlShell, PreviewFeatures, StatusChip, useMl } from "./common";

interface Person { box: number[]; score: number; keypoints: { name: string; x: number; y: number; visibility: number }[] | null; joint_angles_degrees?: Record<string, number>; note?: string }
interface ImgRes { persons: Person[]; annotated: string; message: string | null; note: string; seconds: number; model: { name: string; licence: string } }
interface VidRes { frames_analysed: number; frames_with_person: number; frames_without_person: number; analysed_fps: number; seconds: number; persons_per_frame: { t: number; n: number }[]; note: string }
interface Job { status: string; progress: { done: number; total: number; fraction: number }; error: string | null; result: VidRes | null; output_url: string | null }

export default function PoseApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health } = useMl(serviceUrl);
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => { if (!api) return; Promise.all([api.samples("image"), api.samples("video")]).then(([a, b]) => setSamples([...a.samples, ...b.samples].filter((s) => ["street", "astronaut", "rocket", "pedestrians-8s"].includes(s.id)))).catch(() => undefined); }, [api]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [name, setName] = useState(""); const [img, setImg] = useState<ImgRes | null>(null); const [job, setJob] = useState<Job | null>(null); const [sel, setSel] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null); useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const image = async (src: File | Sample) => { if (!api) return; setError(""); setBusy(true); setJob(null); setSel(0); setName(src instanceof File ? src.name : src.title); try { setImg(await api.post<ImgRes>("/api/pose/image", form({ ...(src instanceof File ? { file: src } : { sample_id: src.id }), threshold: 0.35 }))); } catch (e) { setError(e instanceof Error ? e.message : "Pose estimation failed."); setImg(null); } finally { setBusy(false); } };
  const video = async (src: File | Sample) => {
    if (!api) return; setError(""); setImg(null); setJob(null); setName(src instanceof File ? src.name : src.title);
    try {
      const file = src instanceof File ? src : new File([await (await fetch(api.sampleUrl(src.id))).blob()], src.file, { type: "video/mp4" });
      if (file.size > (health?.limits.max_video_mb ?? 80) * 1_000_000) { setError(`The video is larger than the ${health?.limits.max_video_mb ?? 80} MB limit.`); return; }
      setBusy(true); const j = await api.post<{ job_id: string }>("/api/pose/video", form({ file, threshold: 0.35, analysed_fps: 3 }));
      timer.current = setInterval(async () => { try { const s = await api.get<Job & { job_id: string }>(`/api/jobs/${j.job_id}`); setJob(s); if (["completed", "failed", "cancelled"].includes(s.status)) { if (timer.current) clearInterval(timer.current); setBusy(false); if (s.status === "failed") setError(s.error ?? "Processing failed."); } } catch (e) { if (timer.current) clearInterval(timer.current); setBusy(false); setError(e instanceof Error ? e.message : "Lost contact."); } }, 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Video processing failed."); setBusy(false); }
  };
  const p = img?.persons[sel]; const vr = job?.result;
  return (
    <MlShell branding={branding} title="AI Human Pose Estimation & Activity Recognition" project={name || "No file selected"} service={service}
      notice="A real person detector (YOLOX) and pose model (BlazePose) estimate 33 body-joint positions. A pose is a set of joint positions: it does not tell what someone is doing, intends or feels, so no activity label, fall, aggression or health judgement is produced."
      footer="Working: pose on images and uploaded videos (frame by frame). Not implemented: activity classification, tracking, live camera, biomechanics, fall detection (previews below; the fall-review demo has its own rule-based candidates).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Input <StatusChip s="working" /></h2>
          <Dropzone label="Upload an image" accept="image/*,.tif,.tiff" disabled={service !== "online" || busy} onFile={image} testId="file-image" />
          <Dropzone label={`Upload a video (up to ${health?.limits.max_video_seconds ?? 60} s)`} accept="video/*,.mkv,.avi" disabled={service !== "online" || busy} onFile={video} testId="file-video" />
          <div className="mt-3 flex flex-wrap gap-2">{samples.map((s) => <button key={s.id} className={BTN} disabled={service !== "online" || busy} onClick={() => (s.kind === "video" ? video(s) : image(s))} data-testid={`sample-${s.id}`}>{s.title}</button>)}</div>
          <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Sample sources and licences</summary>{samples.map((s) => <p key={s.id} className="mt-1"><strong>{s.title}</strong>: {s.provenance}. {s.licence}.</p>)}</details>
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Pose</h2>
          {busy && !job && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Estimating pose…</p>}
          {job && busy && <div className="mt-3" data-testid="progress"><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${Math.round(job.progress.fraction * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-400">{job.progress.done} of {job.progress.total} frames</p></div>}
          {!busy && !img && !vr && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Choose an image or video. No pose is shown until a model has produced it.</p>}
          {img && !busy && (
            <div className="mt-3 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.annotated} alt="Image with pose skeletons" className="w-full rounded-md bg-black object-contain" data-testid="annotated" />
              {img.message && <p className="text-sm text-amber-200" data-testid="no-person">{img.message}</p>}
              <p className="text-xs text-slate-400">{img.persons.length} person(s) · {img.seconds} s · {img.model.name} ({img.model.licence}). {img.note}</p>
              {img.persons.length > 0 && <div className="flex flex-wrap gap-2">{img.persons.map((q, i) => <button key={i} className={`${BTN} ${i === sel ? "border-blue-500 text-white" : ""}`} onClick={() => setSel(i)} data-testid="person-btn">Person {i + 1}</button>)}</div>}
              {p && (p.keypoints ? (
                <div data-testid="pose-output">
                  <p className="text-xs text-slate-300">Detector confidence {(p.score * 100).toFixed(0)}%. Joint angles (only where all three joints are visible): {Object.keys(p.joint_angles_degrees ?? {}).length ? Object.entries(p.joint_angles_degrees!).map(([k, v]) => `${k.replace("_", " ")} ${v}°`).join(", ") : "none visible enough"}.</p>
                  <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th>Keypoint</th><th>x</th><th>y</th><th>Visibility</th></tr></thead><tbody>{p.keypoints.map((k) => <tr key={k.name} className="border-t border-slate-800"><td className="py-0.5">{k.name.replace(/_/g, " ")}</td><td>{k.x}</td><td>{k.y}</td><td className={k.visibility < 0.5 ? "text-amber-300" : ""}>{k.visibility.toFixed(2)}</td></tr>)}</tbody></table></div>
                </div>
              ) : <p className="text-xs text-amber-200">{p.note}</p>)}
            </div>
          )}
          {vr && job?.status === "completed" && api && (
            <div className="mt-3 space-y-3" data-testid="video-result">
              <video src={api.url(job.output_url!)} controls muted playsInline className="w-full rounded-md bg-black" data-testid="annotated-video" />
              <p className="text-xs text-slate-300">{vr.frames_analysed} frames analysed at {vr.analysed_fps} fps in {vr.seconds} s: {vr.frames_with_person} with at least one person, {vr.frames_without_person} with none. {vr.note}</p>
              <button className={GO} onClick={() => saveUrl("annotated.mp4", api.url(job.output_url!))} data-testid="dl-video">Download annotated video (MP4)</button>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Activity recognition", status: "soon", note: "no activity classifier is implemented; pose alone is not an activity label." },
        { name: "Multi-person tracking", status: "soon", note: "people are not linked between frames." },
        { name: "Sports biomechanics", status: "preview", note: "no calibrated 3-D or timing analysis exists." },
        { name: "Fall detection", status: "preview", note: "see the separate Human Activity, Fall & Aggression review demo for rule-based candidates." },
        { name: "Live camera processing", status: "hardware", note: "no live camera input is implemented." },
      ]} />
    </MlShell>
  );
}
