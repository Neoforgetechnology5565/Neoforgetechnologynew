"use client";
import { useEffect, useRef, useState } from "react";
import type { Branding } from "@/lib/types";
import { saveUrl, form, saveData } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, GO, H3, MlShell, PreviewFeatures, SamplePicker, StatusChip, useMl } from "./common";

interface Det { label: string; score: number; box: number[] }
interface ImgRes { filename: string; width: number; height: number; detections: Det[]; counts: Record<string, number>; seconds: number; annotated: string; note: string; model: { name: string; licence: string } }
interface VidRes { frames_analysed: number; analysed_fps: number; source_fps: number; seconds: number; detection_instances_by_class: Record<string, number>; max_in_one_frame: Record<string, number>; per_frame_counts: { t: number; n: number }[]; note: string; width: number; height: number }
interface Job { job_id: string; status: string; progress: { done: number; total: number; fraction: number }; error: string | null; result: VidRes | null; output_url: string | null }

export default function DetectApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, health } = useMl(serviceUrl);
  const [images, setImages] = useState<import("@/lib/ml/api").Sample[]>([]); const [videos, setVideos] = useState<import("@/lib/ml/api").Sample[]>([]);
  useEffect(() => { if (!api) return; api.samples("image").then((s) => setImages(s.samples)).catch(() => undefined); api.samples("video").then((s) => setVideos(s.samples)).catch(() => undefined); }, [api]);
  const [thr, setThr] = useState(0.35); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [name, setName] = useState("");
  const [img, setImg] = useState<ImgRes | null>(null); const [job, setJob] = useState<Job | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const runImage = async (src: File | import("@/lib/ml/api").Sample) => {
    if (!api) return; setError(""); setBusy(true); setJob(null); setName(src instanceof File ? src.name : src.title);
    try { setImg(await api.post<ImgRes>("/api/detect/image", form({ ...(src instanceof File ? { file: src } : { sample_id: src.id }), threshold: thr }))); } catch (e) { setError(e instanceof Error ? e.message : "Detection failed."); setImg(null); } finally { setBusy(false); }
  };
  const runVideo = async (f: File | import("@/lib/ml/api").Sample) => {
    if (!api) return; setError(""); setImg(null); setJob(null); setName(f instanceof File ? f.name : f.title);
    try {
      let file: File;
      if (f instanceof File) file = f; else { const b = await (await fetch(api.sampleUrl(f.id))).blob(); file = new File([b], f.file, { type: "video/mp4" }); }
      if (file.size > (health?.limits.max_video_mb ?? 80) * 1_000_000) { setError(`The video is larger than the ${health?.limits.max_video_mb ?? 80} MB limit.`); return; }
      setBusy(true);
      const j = await api.post<{ job_id: string }>("/api/detect/video", form({ file, threshold: thr, analysed_fps: 3 }));
      timer.current = setInterval(async () => {
        try { const s = await api.get<Job>(`/api/jobs/${j.job_id}`); setJob(s); if (["completed", "failed", "cancelled"].includes(s.status)) { if (timer.current) clearInterval(timer.current); setBusy(false); if (s.status === "failed") setError(s.error ?? "Processing failed."); } }
        catch (e) { if (timer.current) clearInterval(timer.current); setBusy(false); setError(e instanceof Error ? e.message : "Lost contact with the service."); }
      }, 1000);
    } catch (e) { setError(e instanceof Error ? e.message : "Video processing failed."); setBusy(false); }
  };
  const vr = job?.result;
  return (
    <MlShell branding={branding} title="AI Object Detection & Video Analytics" project={name || "No file selected"} service={service}
      notice="A real YOLOX-S model detects the 80 COCO object classes. Video is analysed at a reduced frame rate (3 per second), not live, and objects are not tracked: the same object is counted in every frame it appears in."
      footer="Working: image detection and uploaded-video detection with downloadable annotated output. Not implemented: live cameras, multi-camera monitoring, tracking, alerts, long-term analytics (previews below).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Input <StatusChip s="working" /></h2>
          <label className="mt-3 flex items-center justify-between text-xs text-slate-300">Confidence threshold<input type="number" min={0.05} max={0.95} step={0.05} value={thr} onChange={(e) => setThr(Number(e.target.value))} className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" data-testid="threshold" /></label>
          <Dropzone label="Upload an image (JPEG, PNG, WebP, TIFF)" accept="image/*,.tif,.tiff" disabled={service !== "online" || busy} onFile={runImage} testId="file-image" />
          <Dropzone label={`Upload a video (MP4, MOV, WebM, MKV, AVI; up to ${health?.limits.max_video_seconds ?? 60} s)`} accept="video/*,.mkv,.avi" disabled={service !== "online" || busy} onFile={runVideo} testId="file-video" />
          <p className="mt-3 text-xs text-slate-400">Samples</p>
          <div className="mt-2 flex flex-wrap gap-2">{images.filter((s) => ["street", "astronaut", "coffee"].includes(s.id)).map((s) => <button key={s.id} className={BTN} disabled={service !== "online" || busy} onClick={() => runImage(s)} data-testid={`sample-${s.id}`}>{s.title}</button>)}{videos.map((s) => <button key={s.id} className={BTN} disabled={service !== "online" || busy} onClick={() => runVideo(s)} data-testid={`sample-${s.id}`}>{s.title}</button>)}</div>
          <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Sample sources and licences</summary>{[...images, ...videos].filter((s) => ["street", "astronaut", "coffee", "pedestrians-8s"].includes(s.id)).map((s) => <p key={s.id} className="mt-1"><strong>{s.title}</strong>: {s.provenance}. {s.licence}.</p>)}</details>
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Detections</h2>
          {busy && !job && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Processing…</p>}
          {job && busy && <div className="mt-3" data-testid="progress"><div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${Math.round(job.progress.fraction * 100)}%` }} /></div><p className="mt-1 text-xs text-slate-400">{job.progress.done} of {job.progress.total} frames</p></div>}
          {!busy && !img && !vr && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Choose an image or a video. Nothing is detected until you do.</p>}
          {img && !busy && (
            <div className="mt-3 space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.annotated} alt="Image with detected objects" className="w-full rounded-md bg-black object-contain" data-testid="annotated" />
              <p className="text-xs text-slate-400">{img.detections.length} detection(s) at threshold {thr} · {img.seconds} s · {img.model.name}. {img.note}</p>
              {img.detections.length === 0 && <p className="text-sm text-slate-200" data-testid="none">No objects were detected above the threshold.</p>}
              <table className="w-full text-left text-xs" data-testid="detections"><thead className="text-slate-400"><tr><th>Class</th><th>Confidence</th><th>Box (x1, y1, x2, y2)</th></tr></thead><tbody>{img.detections.map((d, i) => <tr key={i} className="border-t border-slate-800"><td className="py-1">{d.label}</td><td>{(d.score * 100).toFixed(0)}%</td><td>{d.box.map((v) => Math.round(v)).join(", ")}</td></tr>)}</tbody></table>
              <button className={BTN} onClick={() => saveData("annotated.jpg", img.annotated)} data-testid="dl-image">Download annotated image</button>
            </div>
          )}
          {vr && job?.status === "completed" && api && (
            <div className="mt-3 space-y-3" data-testid="video-result">
              <video src={api.url(job.output_url!)} controls muted playsInline className="w-full rounded-md bg-black" data-testid="annotated-video" />
              <p className="text-xs text-slate-400">{vr.frames_analysed} frames analysed at {vr.analysed_fps} fps (source {vr.source_fps} fps) in {vr.seconds} s. {vr.note}</p>
              <table className="w-full text-left text-xs" data-testid="video-counts"><thead className="text-slate-400"><tr><th>Class</th><th>Detections (all frames)</th><th>Most in one frame</th></tr></thead><tbody>{Object.entries(vr.detection_instances_by_class).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k} className="border-t border-slate-800"><td className="py-1">{k}</td><td>{v}</td><td>{vr.max_in_one_frame[k]}</td></tr>)}</tbody></table>
              <button className={GO} onClick={() => saveUrl("annotated.mp4", api.url(job.output_url!))} data-testid="dl-video">Download annotated video (MP4)</button>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Multi-camera monitoring", status: "hardware", note: "no cameras are connected to this demo." },
        { name: "Advanced object tracking", status: "soon", note: "detections are independent in each frame (the CCTV demo has ByteTrack tracking)." },
        { name: "Automatic incident alerts", status: "external", note: "no alerting or messaging integration exists." },
        { name: "Long-term analytics and reporting", status: "soon", note: "nothing is stored after the job expires." },
      ]} />
    </MlShell>
  );
}
