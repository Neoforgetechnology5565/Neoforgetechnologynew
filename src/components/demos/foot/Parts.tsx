"use client";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type DragEvent } from "react";
import type { SessionDTO } from "@/lib/foot/api-types";
import type { PaperKind } from "@/lib/foot/types";
import { PAPER_MM } from "@/lib/foot/types";
import { api, type Auth } from "./api";

export const FOOT_SLUG = "ai-shoe-foot-measurement-fitting";
export const BIG = "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:border-emerald-600 hover:text-emerald-800 disabled:opacity-50";
export const GO = "rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50";
export const CARD = "rounded-xl border border-stone-200 bg-white p-4 shadow-sm";
export const H = "font-display text-lg font-semibold text-stone-900";
export const SUB = "text-sm text-stone-600";
export const GRADE: Record<string, string> = { good: "bg-emerald-100 text-emerald-800", fair: "bg-amber-100 text-amber-800", poor: "bg-orange-100 text-orange-800", unusable: "bg-red-100 text-red-800" };

export const timeLeft = (ms: number) => { const s = Math.max(0, Math.round((ms - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Desktop → phone hand-off: a QR code for a link that carries a short-lived, capture-only token in the URL fragment (never sent to a server as part of the URL). */
export function PhoneLink({ auth, session, onChanged }: { auth: Auth; session: SessionDTO; onChanged: () => void }) {
  const [qr, setQr] = useState(""); const [link, setLink] = useState(""); const [exp, setExp] = useState(0); const [err, setErr] = useState(""); const [, tick] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);
  const make = async () => {
    setBusy(true); setErr("");
    try { const r = await api.phoneLink(auth); const url = `${window.location.origin}/ai-demos/${FOOT_SLUG}/app/scan#s=${auth.id}&t=${r.token}`; setLink(url); setExp(r.expiresAt); setQr(await QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: "M" })); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const revoke = async () => { try { await api.revokePhone(auth); setQr(""); setLink(""); setExp(0); onChanged(); } catch (e) { setErr((e as Error).message); } };
  const live = qr && exp > Date.now(); const local = typeof window !== "undefined" && /^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname);
  return (
    <div>
      {!live ? <button type="button" className={GO} onClick={make} disabled={busy}>{exp && exp <= Date.now() ? "Link expired — create a new QR code" : busy ? "Creating…" : "Create QR code for my phone"}</button>
        : <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code that opens the phone scanner for this session" width={168} height={168} className="rounded border border-stone-300 bg-white p-1" />
          <div className="min-w-0 flex-1 text-sm text-stone-700">
            <p><b>Scan with your phone camera.</b> It opens the scanner already linked to this session — no sign-in.</p>
            <p className="mt-1">Expires in <b className="tabular-nums">{timeLeft(exp)}</b> · capture-only access · {session.captureCount} photo(s) so far.</p>
            <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={BIG} onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button><button type="button" className={BIG} onClick={make}>New code</button><button type="button" className={BIG} onClick={revoke}>Revoke</button></div>
            {local && <p className="mt-2 rounded bg-amber-50 p-2 text-amber-900">You are on a local address ({window.location.hostname}). A phone can only open this link if it can reach this computer on the same network and the camera needs https; on the deployed site the QR code just works.</p>}
          </div></div>}
      {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
    </div>
  );
}

/** Drag-and-drop / file-picker for existing photos. Files are checked by type and size before anything is sent. */
export function Dropzone({ onFiles, accept = "image/jpeg,image/png,image/webp", multiple = true, children, maxMb = 8 }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; children: React.ReactNode; maxMb?: number }) {
  const input = useRef<HTMLInputElement>(null); const [over, setOver] = useState(false); const [msg, setMsg] = useState("");
  const take = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []); const ok: File[] = []; const bad: string[] = [];
    for (const f of files) { if (!/^image\/(jpeg|png|webp)$/.test(f.type) && !/\.(jpe?g|png|webp)$/i.test(f.name)) bad.push(`${f.name}: not a JPEG, PNG or WebP image`); else if (f.size > maxMb * 1048576 * 4) bad.push(`${f.name}: larger than ${maxMb * 4} MB`); else ok.push(f); }
    setMsg(bad.join(" · ")); if (ok.length) onFiles(ok);
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); };
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop} className={`rounded-xl border-2 border-dashed p-4 text-center transition ${over ? "border-emerald-600 bg-emerald-50" : "border-stone-300 bg-stone-50"}`}>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} data-testid="foot-file-input" />
      {children}
      <div className="mt-2"><button type="button" className={BIG} onClick={() => input.current?.click()}>Choose photo{multiple ? "s" : ""}…</button></div>
      {msg && <p role="alert" className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}

/** A sheet to print and measure with a ruler, so the person can confirm the printer/scaling before trusting a printed marker. */
export function openPrintCheck(paper: PaperKind) {
  const P = PAPER_MM[paper]; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${P.h}mm" height="${P.w}mm" viewBox="0 0 ${P.h} ${P.w}" font-family="Georgia, serif"><rect width="100%" height="100%" fill="#fff"/>
  <text x="${P.h / 2}" y="22" text-anchor="middle" font-size="9" font-weight="bold">Scale check — print at 100% (Actual size)</text>
  <text x="${P.h / 2}" y="31" text-anchor="middle" font-size="4.6">Measure the bar below with a ruler. It must read exactly 100 mm. If it does not, turn off “fit to page”.</text>
  <g stroke="#000" stroke-width="0.5"><line x1="20" y1="60" x2="120" y2="60" stroke-width="1"/>${Array.from({ length: 11 }, (_, i) => `<line x1="${20 + i * 10}" y1="${i % 5 === 0 ? 54 : 56}" x2="${20 + i * 10}" y2="66"/>`).join("")}</g>
  <text x="20" y="75" font-size="4.5">0</text><text x="115" y="75" font-size="4.5">100 mm</text>
  <rect x="20" y="95" width="100" height="100" fill="none" stroke="#000" stroke-width="0.8"/><text x="70" y="148" text-anchor="middle" font-size="4.6">100 × 100 mm square</text>
  <text x="20" y="230" font-size="4.6">The measurement itself does not need this page: the plain ${P.label} sheet you photograph is the scale.</text>
  <text x="20" y="238" font-size="4.6">Use this page only to check that your printer is not rescaling output.</text></svg>`;
  const w = window.open(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), "_blank", "noopener"); void w;
}

/** Step-by-step capture instructions as a drawing: sheet, foot, phone above. */
export function SetupDiagram() {
  return (
    <svg viewBox="0 0 360 220" className="w-full max-w-md" role="img" aria-label="Diagram: a white sheet of paper flat on the floor with a bare foot on it, heel near one short edge, and a phone held above pointing straight down">
      <rect width="360" height="220" rx="10" fill="#57534e" />
      <rect x="40" y="80" width="250" height="124" fill="#fafaf9" stroke="#e7e5e4" /><text x="165" y="195" textAnchor="middle" fontSize="11" fill="#78716c" fontFamily="Georgia">A4 / Letter sheet · all 4 corners visible</text>
      <path d="M70 170 C62 150 66 122 90 116 C130 108 190 106 232 112 C256 118 260 146 244 160 C226 176 150 180 100 178 C84 178 74 176 70 170Z" fill="#d6b394" stroke="#a16207" />
      <text x="150" y="150" textAnchor="middle" fontSize="11" fill="#44403c" fontFamily="Georgia">bare foot, flat</text>
      <g transform="translate(300 18)"><rect width="40" height="70" rx="7" fill="#1c1917" stroke="#a8a29e" /><circle cx="20" cy="14" r="5" fill="#10b981" /></g>
      <path d="M320 92 L320 124" stroke="#34d399" strokeWidth="2" strokeDasharray="4 3" /><path d="M314 118 L320 128 L326 118" fill="none" stroke="#34d399" strokeWidth="2" /><text x="318" y="146" textAnchor="middle" fontSize="10" fill="#d1fae5" fontFamily="Georgia">straight down</text>
    </svg>
  );
}
