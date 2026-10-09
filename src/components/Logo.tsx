/* eslint-disable @next/next/no-img-element */
import { logoUrl } from "@/lib/cloudinary";
import type { MediaRef } from "@/lib/types";

/** Uploaded logo (Cloudinary, auto-cropped) or the text wordmark when none has been uploaded. */
export default function Logo({ media, trim, height, dark, priority }: { media: MediaRef | null; trim: boolean; height: number; dark?: boolean; priority?: boolean }) {
  if (media) {
    return <img src={logoUrl(media, { h: height, trim })} alt="Neo Forge Technology" height={height} style={{ height, width: "auto", maxWidth: "min(70vw, 280px)" }} loading={priority ? "eager" : "lazy"} decoding="async" />;
  }
  return (
    <span className="flex flex-col leading-tight">
      <span className={`font-display text-xl font-semibold tracking-tight ${dark ? "text-white" : "text-stone-900"}`}>Neo Forge Technology</span>
      <span className={`text-[10px] font-medium uppercase tracking-[0.25em] ${dark ? "text-blue-400" : "text-blue-600"}`}>Software · AI · CAD/BIM</span>
    </span>
  );
}
