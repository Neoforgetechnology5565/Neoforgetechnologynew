import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { HttpError } from "./auth";
import { cloudinaryConfigProblem } from "./cloudinary-config";
import type { MediaRef } from "./types";

const ACCENT: Record<string, string> = { "computer-vision": "#2563eb", "crm-hrm-erp": "#0891b2", "cad-bim": "#4f46e5", "": "#2563eb" };
const LABEL: Record<string, string> = { "computer-vision": "AI · COMPUTER VISION", "crm-hrm-erp": "CRM · HRM · ERP", "cad-bim": "CAD · BIM · AUTOMATION", "": "NEO FORGE TECHNOLOGY" };

/** Uploads a generated image straight to our Cloudinary (server-side, signed). */
export async function uploadPng(buf: Buffer | Uint8Array, folder: string, name: string): Promise<MediaRef> {
  const problem = cloudinaryConfigProblem();
  if (problem) throw new HttpError(503, problem);
  cloudinary.config({ cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true, upload_prefix: process.env.CLOUDINARY_UPLOAD_PREFIX || undefined });
  const r = await new Promise<{ secure_url: string; public_id: string; format: string; bytes: number; width: number; height: number }>((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: `neoforge/${folder}`, resource_type: "image", format: "png" }, (err, res) => (err || !res ? reject(err ?? new Error("upload failed")) : resolve(res as never))).end(Buffer.from(buf));
  }).catch(() => { throw new HttpError(502, "Could not upload the generated image to Cloudinary."); });
  return { url: r.secure_url, publicId: r.public_id, resourceType: "image", format: r.format, bytes: r.bytes, width: r.width, height: r.height, name };
}

async function toBuffer(el: ReactElement, width: number, height: number): Promise<Buffer> {
  return Buffer.from(await new ImageResponse(el, { width, height }).arrayBuffer());
}

function motif(division: string, c: string) {
  const base = { position: "absolute" as const, display: "flex" };
  if (division === "crm-hrm-erp") {
    return (
      <div style={{ ...base, right: 70, top: 70, flexDirection: "column" }}>
        {[0, 1, 2, 3].map((r) => (
          <div key={r} style={{ display: "flex" }}>
            {[0, 1, 2, 3].map((k) => <div key={k} style={{ display: "flex", width: 54, height: 54, margin: 7, borderRadius: 10, background: (r + k) % 3 === 0 ? c : "#dbeafe", opacity: (r + k) % 3 === 0 ? 0.9 : 0.8 }} />)}
          </div>
        ))}
      </div>
    );
  }
  if (division === "cad-bim") {
    return (
      <div style={{ ...base, right: 80, top: 80, width: 330, height: 330 }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ ...base, left: 20 + i * 55, top: 200 - i * 70, width: 190, height: 70, background: i === 1 ? c : "#dbeafe", border: `3px solid ${c}`, borderRadius: 6, opacity: 0.9 }} />)}
        <div style={{ ...base, left: 0, top: 290, width: 330, height: 4, background: c }} />
      </div>
    );
  }
  return (
    <div style={{ ...base, right: 60, top: 60, width: 360, height: 360 }}>
      {[360, 250, 140].map((s, i) => <div key={s} style={{ ...base, left: (360 - s) / 2, top: (360 - s) / 2, width: s, height: s, borderRadius: s, border: `${i === 2 ? 8 : 3}px solid ${c}`, opacity: 0.35 + i * 0.25 }} />)}
      <div style={{ ...base, left: 178, top: 40, width: 4, height: 280, background: c, opacity: 0.5 }} />
      <div style={{ ...base, left: 40, top: 178, width: 280, height: 4, background: c, opacity: 0.5 }} />
    </div>
  );
}

/** Branded 1200×630 cover (also the share preview): title, division label and a division-specific graphic. */
export async function renderCover(title: string, division: string): Promise<Buffer> {
  const c = ACCENT[division] ?? ACCENT[""];
  const size = title.length > 90 ? 50 : title.length > 60 ? 58 : 66;
  return toBuffer(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "linear-gradient(135deg,#ffffff 0%,#eff6ff 100%)", position: "relative" }}>
      {motif(division, c)}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 5, color: c, fontWeight: 700 }}>{LABEL[division] ?? LABEL[""]}</div>
        <div style={{ display: "flex", width: 90, height: 6, background: c, borderRadius: 4, marginTop: 18 }} />
      </div>
      <div style={{ display: "flex", maxWidth: 650, fontSize: size - 6, lineHeight: 1.12, fontWeight: 700, color: "#0f172a", letterSpacing: -1 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#334155" }}>
        <div style={{ display: "flex", fontWeight: 700 }}>Neo Forge Technology</div>
        <div style={{ display: "flex", color: "#64748b" }}>neoforgetechnologies.com</div>
      </div>
    </div>,
    1200, 630,
  );
}

export interface Figure { kind: "flow" | "takeaways"; title: string; items: string[]; alt: string }

/** A simple diagram image: numbered steps joined by arrows, or a "key takeaways" card. */
export async function renderFigure(f: Figure, division: string): Promise<Buffer> {
  const c = ACCENT[division] ?? ACCENT[""];
  const items = f.items.map((s) => s.slice(0, 70)).slice(0, f.kind === "flow" ? 5 : 6);
  const head = (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 34 }}>
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#0f172a" }}>{f.title.slice(0, 80)}</div>
      <div style={{ display: "flex", width: 80, height: 5, background: c, borderRadius: 3, marginTop: 14 }} />
    </div>
  );
  const foot = <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 20, color: "#94a3b8", marginTop: "auto" }}>Neo Forge Technology</div>;
  const frame = { width: "100%", height: "100%", display: "flex", flexDirection: "column" as const, padding: "48px 56px", background: "#ffffff", border: "2px solid #dbeafe" };
  if (f.kind === "flow") {
    return toBuffer(
      <div style={frame}>
        {head}
        <div style={{ display: "flex", alignItems: "stretch", flex: 1, maxHeight: 220 }}>
          {items.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, height: "100%", padding: 18, borderRadius: 14, background: "#eff6ff", border: `2px solid ${c}` }}>
                <div style={{ display: "flex", width: 44, height: 44, borderRadius: 44, background: c, color: "#fff", fontSize: 24, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                <div style={{ display: "flex", marginTop: 14, fontSize: 24, lineHeight: 1.25, color: "#0f172a" }}>{s}</div>
              </div>
              {i < items.length - 1 && <div style={{ display: "flex", fontSize: 40, color: c, padding: "0 8px" }}>→</div>}
            </div>
          ))}
        </div>
        {foot}
      </div>,
      1200, 450,
    );
  }
  return toBuffer(
    <div style={frame}>
      {head}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", width: 36, height: 36, borderRadius: 36, background: c, color: "#fff", fontSize: 22, fontWeight: 700, alignItems: "center", justifyContent: "center", marginRight: 18 }}>{i + 1}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#0f172a" }}>{s}</div>
          </div>
        ))}
      </div>
      {foot}
    </div>,
    1200, 160 + items.length * 62 + 60,
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "image";

export async function makeCover(title: string, division: string): Promise<MediaRef> {
  return uploadPng(await renderCover(title, division), "blog", `cover-${slug(title)}.png`);
}
export async function makeFigure(f: Figure, division: string): Promise<MediaRef> {
  return uploadPng(await renderFigure(f, division), "blog", `figure-${slug(f.title)}.png`);
}
