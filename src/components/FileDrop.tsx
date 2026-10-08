"use client";
import { useRef, useState } from "react";
import type { MediaRef } from "@/lib/types";
import { uploadToCloudinary, type UploadKind } from "@/lib/upload";
import { formatBytes } from "@/lib/utils";

interface Props {
  label: string;
  accept: string;
  multiple?: boolean;
  kind?: UploadKind;
  endpoint?: string;
  folder?: string;
  value: MediaRef[];
  onChange: (v: MediaRef[]) => void;
  max?: number;
  light?: boolean;
  hint?: string;
}

/** Click or drag-and-drop uploader that sends files to Cloudinary and reports the resulting references. */
export default function FileDrop({ label, accept, multiple, kind, endpoint, folder, value, onChange, max = 20, light, hint }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ name: string; pct: number }[]>([]);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  async function handle(files: FileList | File[]) {
    setError("");
    const list = Array.from(files).slice(0, Math.max(0, max - value.length));
    const results: MediaRef[] = [];
    for (const f of list) {
      setBusy((b) => [...b, { name: f.name, pct: 0 }]);
      try {
        results.push(await uploadToCloudinary(f, { kind, endpoint, folder, onProgress: (pct) => setBusy((b) => b.map((x) => (x.name === f.name ? { ...x, pct } : x))) }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy((b) => b.filter((x) => x.name !== f.name));
      }
    }
    if (results.length) onChange(multiple ? [...value, ...results] : results.slice(0, 1));
  }

  const border = light ? "border-stone-300 hover:border-blue-600" : "border-paper/25 hover:border-forge";
  return (
    <div>
      <span className={light ? "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500" : "label"}>{label}</span>
      <div
        role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
        className={`cursor-pointer rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors ${border} ${over ? "bg-forge/10" : ""}`}
      >
        <p className={light ? "text-stone-600" : "text-paper/70"}>Tap to choose or drag &amp; drop{multiple ? " files" : " a file"}</p>
        {hint && <p className={`mt-1 text-xs ${light ? "text-stone-400" : "text-paper/40"}`}>{hint}</p>}
        <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
      </div>
      {busy.map((b) => (
        <div key={b.name} className="mt-2 text-xs">
          <div className="flex justify-between"><span className="truncate">{b.name}</span><span>{b.pct}%</span></div>
          <div className="mt-1 h-1 bg-paper/10"><div className="h-1 bg-forge transition-all" style={{ width: `${b.pct}%` }} /></div>
        </div>
      ))}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      {value.length > 0 && (
        <ul className="mt-2 space-y-1">
          {value.map((m, i) => (
            <li key={m.publicId + i} className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${light ? "bg-stone-100 text-stone-700" : "bg-paper/5"}`}>
              <span className="truncate">{m.name || m.publicId} <span className="opacity-50">{formatBytes(m.bytes)}</span></span>
              <button type="button" className="shrink-0 text-red-400 hover:underline" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
