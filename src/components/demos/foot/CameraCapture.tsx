"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeFootImage, detectPaper } from "@/lib/foot/vision";
import { SetupDiagram } from "./Parts";
import type { PaperKind, Pt } from "@/lib/foot/types";
import { PAPER_MM } from "@/lib/foot/types";

type Status = "starting" | "live" | "denied" | "unsupported" | "nodevice" | "error";
interface Live { found: boolean; corners?: Pt[]; inside?: boolean; tilt?: number; coverage?: number; brightness?: number; sharp?: number; ready: boolean; hint: string }

const HINTS = { none: "Lay a plain white sheet flat on a darker floor and keep all four corners in view.", inside: "Move back a little: every corner of the sheet must be inside the picture.", tilt: "Hold the phone flat and pointing straight down, not at an angle.", close: "Move the phone closer so the sheet fills more of the picture.", dark: "Too dark. Turn on a light or move to a brighter spot.", glare: "The sheet is overexposed. Reduce glare.", blur: "Hold steady and let the camera focus.", ready: "Good. Place your bare foot on the sheet, heel near one short edge, and capture." };

/** Live camera with guidance computed from the same paper detector the server uses. Nothing is uploaded until the person confirms a photo. */
export default function CameraCapture({ paper, title, onUse, onClose, onFallback }: { paper: PaperKind; title: string; onUse: (blob: Blob) => void; onClose: () => void; onFallback?: () => void }) {
  const video = useRef<HTMLVideoElement>(null), overlay = useRef<HTMLCanvasElement>(null), work = useRef<HTMLCanvasElement | null>(null), stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting"); const [msg, setMsg] = useState(""); const [devices, setDevices] = useState<MediaDeviceInfo[]>([]); const [deviceId, setDeviceId] = useState<string>(""); const [live, setLive] = useState<Live>({ found: false, ready: false, hint: HINTS.none });
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null); const [check, setCheck] = useState<{ state: "working" | "ok" | "bad"; text: string } | null>(null); const [example, setExample] = useState(true); const [vw, setVw] = useState({ w: 4, h: 3 });

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; }, []);
  const start = useCallback(async (id?: string) => {
    stop(); setStatus("starting"); setMsg("");
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); setMsg(!window.isSecureContext ? "The camera only works on a secure (https) page. Use the photo-picker instead." : "This browser does not support camera access."); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: "environment" } }), width: { ideal: 1920 }, height: { ideal: 1440 } } });
      stream.current = s; const v = video.current; if (!v) { s.getTracks().forEach((t) => t.stop()); return; } v.srcObject = s; await v.play().catch(() => undefined);
      const st = s.getVideoTracks()[0]?.getSettings(); if (st?.width && st?.height) setVw({ w: st.width, h: st.height }); if (st?.deviceId) setDeviceId(st.deviceId);
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput")); setStatus("live");
    } catch (e) {
      const n = (e as DOMException).name; if (n === "NotAllowedError" || n === "SecurityError") { setStatus("denied"); setMsg("Camera permission was blocked. Allow the camera for this site in the browser settings, or use the photo-picker."); }
      else if (n === "NotFoundError" || n === "OverconstrainedError") { setStatus("nodevice"); setMsg("No usable camera was found on this device."); } else { setStatus("error"); setMsg("The camera could not be started. Another app may be using it."); }
    }
  }, [stop]);
  useEffect(() => { void start(); return stop; }, [start, stop]);

  // live guidance
  useEffect(() => {
    if (status !== "live") return;
    const tick = () => {
      const v = video.current; if (!v || !v.videoWidth || document.hidden || shot) return; const W = 480, H = Math.round((480 * v.videoHeight) / v.videoWidth);
      const c = (work.current ??= document.createElement("canvas")); c.width = W; c.height = H; const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H); const det = detectPaper({ w: W, h: H, ch: 4, data: d.data }, paper); const sc = v.videoWidth / W;
      let next: Live;
      if (!det.found || !det.corners) next = { found: false, ready: false, hint: (det.brightness ?? 128) < 70 ? HINTS.dark : HINTS.none, brightness: det.brightness };
      else {
        const corners = det.corners.map((p) => ({ x: p.x * sc, y: p.y * sc })); const m = 0.012; const inside = corners.every((p) => p.x > v.videoWidth * m && p.y > v.videoHeight * m && p.x < v.videoWidth * (1 - m) && p.y < v.videoHeight * (1 - m));
        const hint = !inside ? HINTS.inside : (det.tilt ?? 1) > 1.35 ? HINTS.tilt : (det.coverage ?? 0) < 0.12 ? HINTS.close : (det.paperBrightness ?? 200) < 110 ? HINTS.dark : (det.paperBrightness ?? 200) > 250 ? HINTS.glare : (det.sharp ?? 100) < 25 ? HINTS.blur : HINTS.ready;
        next = { found: true, corners, inside, tilt: det.tilt, coverage: det.coverage, brightness: det.paperBrightness, sharp: det.sharp, ready: hint === HINTS.ready, hint };
      }
      setLive(next);
    };
    const id = window.setInterval(tick, 650); return () => window.clearInterval(id);
  }, [status, paper, shot]);

  // overlay drawing
  useEffect(() => {
    const o = overlay.current; if (!o) return; o.width = vw.w; o.height = vw.h; const g = o.getContext("2d")!; g.clearRect(0, 0, o.width, o.height);
    const P = PAPER_MM[paper]; const gw = vw.w * 0.78, gh = (gw * P.h) / P.w; const gx = (vw.w - gw) / 2, gy = (vw.h - gh) / 2; g.lineWidth = Math.max(2, vw.w / 400);
    if (!live.found) { g.setLineDash([vw.w / 40, vw.w / 60]); g.strokeStyle = "rgba(255,255,255,.75)"; g.strokeRect(gx, gy, gw, gh); g.setLineDash([]); g.fillStyle = "rgba(255,255,255,.8)"; g.font = `${Math.round(vw.w / 40)}px Georgia, serif`; g.textAlign = "center"; g.fillText(`${P.label.split(" (")[0]} sheet goes here`, vw.w / 2, gy - vw.w / 80); }
    if (live.found && live.corners) { g.strokeStyle = live.ready ? "#34d399" : "#fbbf24"; g.lineWidth = Math.max(3, vw.w / 250); g.beginPath(); live.corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke(); g.fillStyle = g.strokeStyle; live.corners.forEach((p) => { g.beginPath(); g.arc(p.x, p.y, vw.w / 160, 0, 7); g.fill(); }); }
  }, [live, vw, paper]);

  const snap = () => {
    const v = video.current; if (!v?.videoWidth) return; const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) setShot({ blob: b, url: URL.createObjectURL(b) }); }, "image/jpeg", 0.92);
    // Real check of the still, on-device, with the same engine the server runs: is the sheet found and can the foot be told apart?
    setCheck({ state: "working", text: "Analyzing your image…" });
    window.setTimeout(() => {
      try {
        const k = Math.min(1, 1100 / Math.max(c.width, c.height)); const w = document.createElement("canvas"); w.width = Math.round(c.width * k); w.height = Math.round(c.height * k); const g = w.getContext("2d", { willReadFrequently: true })!; g.drawImage(c, 0, 0, w.width, w.height);
        const d = g.getImageData(0, 0, w.width, w.height); const a = analyzeFootImage({ w: w.width, h: w.height, ch: 4, data: d.data }, { paper }).analysis;
        setCheck(a.ok ? { state: "ok", text: `Great! We found your foot and the paper${a.warnings.length ? ` — note: ${a.warnings[0]}` : ""}` } : { state: "bad", text: `${a.reason} You can retake, or use it anyway and fix the corners by hand.` });
      } catch { setCheck({ state: "bad", text: "The check could not run. The server will still analyse the photo." }); }
    }, 60);
  };
  const clearShot = () => { if (shot) URL.revokeObjectURL(shot.url); setShot(null); setCheck(null); };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={`Camera — ${title}`}>
      <div className="flex items-center gap-3 px-3 py-2"><button type="button" onClick={() => { stop(); onClose(); }} className="rounded-md border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10">Close camera</button><p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        {devices.length > 1 && status === "live" && <select aria-label="Choose camera" value={deviceId} onChange={(e) => void start(e.target.value)} className="max-w-[10rem] rounded-md border border-white/30 bg-black px-2 py-1.5 text-sm">{devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}</select>}</div>
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 items-center justify-center overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: `${vw.w} / ${vw.h}`, maxHeight: "100%" }}>
          <video ref={video} playsInline muted className={`absolute inset-0 h-full w-full ${shot ? "invisible" : ""}`} />
          {shot && <img src={shot.url} alt="Captured photo preview" className="absolute inset-0 h-full w-full object-contain" />}
          {!shot && status === "live" && (example ? <div className="absolute left-2 top-2 w-44 rounded-lg bg-black/70 p-1.5 sm:w-56"><div className="mb-1 flex items-center justify-between text-xs text-white"><span className="font-semibold">Take a photo like this</span><button type="button" onClick={() => setExample(false)} aria-label="Hide example" className="px-1 text-white/80 hover:text-white">✕</button></div><SetupDiagram /></div> : <button type="button" onClick={() => setExample(true)} className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white">Show example</button>)}
          {shot && check && <div role="status" aria-live="polite" className={`absolute inset-x-3 bottom-3 rounded-lg px-3 py-2 text-sm font-medium ${check.state === "ok" ? "bg-emerald-600 text-white" : check.state === "bad" ? "bg-amber-500 text-black" : "bg-black/75 text-white"}`}>{check.state === "ok" ? "✓ " : ""}{check.text}</div>}
          <canvas ref={overlay} className={`pointer-events-none absolute inset-0 h-full w-full ${shot ? "hidden" : ""}`} aria-hidden />
          {status !== "live" && !shot && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center"><div className="max-w-sm"><p className="text-base font-semibold">{status === "starting" ? "Starting camera…" : status === "denied" ? "Camera blocked" : status === "unsupported" ? "Camera unavailable here" : status === "nodevice" ? "No camera found" : "Camera error"}</p>{msg && <p className="mt-2 text-sm text-white/80">{msg}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2">{status !== "starting" && <button type="button" onClick={() => void start()} className="rounded-md border border-white/40 px-3 py-1.5 text-sm hover:bg-white/10">Try again</button>}{onFallback && status !== "starting" && <button type="button" onClick={() => { stop(); onFallback(); }} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-500">Use the photo-picker instead</button>}</div></div></div>}
        </div>
      </div>
      <div className="px-4 pb-5 pt-3 text-center">
        {shot ? <div className="flex flex-wrap items-center justify-center gap-3"><button type="button" onClick={clearShot} className="rounded-md border border-white/40 px-4 py-2 text-sm font-medium hover:bg-white/10">Retake</button><button type="button" onClick={() => { const b = shot.blob; stop(); onUse(b); }} className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold hover:bg-emerald-500">Use this photo</button></div>
          : <><p aria-live="polite" className={`mx-auto mb-3 max-w-md text-sm ${live.ready ? "text-emerald-300" : "text-amber-200"}`}>{status === "live" ? live.hint : "Allow camera access to see live guidance."}</p>
            <button type="button" disabled={status !== "live"} onClick={snap} aria-label="Capture photo" className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 ${live.ready ? "border-emerald-400" : "border-white/70"} disabled:opacity-40`}><span className={`h-12 w-12 rounded-full ${live.ready ? "bg-emerald-400" : "bg-white"}`} /></button>
            <p className="mt-2 text-xs text-white/60">{status === "live" ? (live.ready ? "Guidance checks passed" : "You can still capture; the server re-checks every photo.") : ""} Guidance runs on-device; nothing is uploaded until you confirm.</p></>}
      </div>
    </div>
  );
}
