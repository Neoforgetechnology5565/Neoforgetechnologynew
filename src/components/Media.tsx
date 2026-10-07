/* eslint-disable @next/next/no-img-element */
import { img } from "@/lib/cloudinary";
import type { MediaRef } from "@/lib/types";

/** Cloudinary-optimised responsive image (f_auto,q_auto + srcset). Lazy by default. */
export function CldImg({ media, alt, sizes = "100vw", widths = [480, 800, 1200, 1800], ratio, priority, className = "" }: {
  media: MediaRef; alt: string; sizes?: string; widths?: number[]; ratio?: number; priority?: boolean; className?: string;
}) {
  const srcSet = widths.map((w) => `${img(media, { w })} ${w}w`).join(", ");
  return (
    <img
      src={img(media, { w: widths[Math.min(1, widths.length - 1)] })}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      width={media.width}
      height={media.height}
      style={ratio ? { aspectRatio: String(ratio) } : undefined}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
