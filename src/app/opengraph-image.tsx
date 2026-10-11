import { ImageResponse } from "next/og";
import { ogLogoUrl } from "@/lib/cloudinary";
import { getBranding } from "@/lib/db";

export const alt = "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

/** Fetches the uploaded dark-background logo as a data URI. Any failure just falls back to the text wordmark. */
async function logoData(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) return null;
    return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

/** Default share-preview card (Open Graph + Twitter) for any page without its own image. */
export async function renderCard() {
  const b = await getBranding();
  const logo = await logoData(ogLogoUrl(b.logoDark, b.autoTrim));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#050505 0%,#0b0b0b 60%,#2f7d1a 150%)", color: "white" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" height={92} style={{ height: 92, width: "auto" }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1, fontFamily: "Georgia, serif" }}>Neo Forge Technology</div>
              <div style={{ fontSize: 18, letterSpacing: 6, color: "#7acf48", marginTop: 6 }}>SOFTWARE · AI · CAD/BIM</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, display: "flex", flexWrap: "wrap" }}>Software. AI. Automation. Engineering.</div>
          <div style={{ height: 6, width: 120, background: "#5bc236", marginTop: 34, borderRadius: 4 }} />
          <div style={{ fontSize: 30, color: "#d4d4d4", marginTop: 28 }}>Computer Vision · CRM / HRM / ERP · CAD / BIM</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

export default async function Image() {
  return renderCard();
}
