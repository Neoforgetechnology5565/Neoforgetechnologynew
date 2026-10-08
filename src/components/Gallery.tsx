"use client";
import { useEffect, useState } from "react";
import { img } from "@/lib/cloudinary";
import type { MediaRef } from "@/lib/types";
import { CldImg } from "./Media";

export default function Gallery({ items, title }: { items: MediaRef[]; title: string }) {
  const [i, setI] = useState<number | null>(null);
  useEffect(() => {
    if (i === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setI(null);
      if (e.key === "ArrowRight") setI((x) => (x === null ? x : (x + 1) % items.length));
      if (e.key === "ArrowLeft") setI((x) => (x === null ? x : (x - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [i, items.length]);

  const images = items.filter((m) => m.resourceType === "image");
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {images.map((m, idx) => (
          <li key={m.publicId}>
            <button onClick={() => setI(idx)} className="block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 hover:border-blue-500" aria-label={`Open image ${idx + 1} of ${images.length}`}>
              <CldImg media={m} alt={`${title} — image ${idx + 1}`} sizes="(min-width:1024px) 33vw, 50vw" widths={[400, 700, 1000]} />
            </button>
          </li>
        ))}
      </ul>
      {i !== null && (
        <div role="dialog" aria-modal="true" aria-label="Image viewer" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4" onClick={() => setI(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img(images[i], { w: 2000 })} alt={`${title} — image ${i + 1}`} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          <button className="absolute right-4 top-4 p-2 text-2xl" aria-label="Close" onClick={() => setI(null)}>✕</button>
          {images.length > 1 && (<>
            <button className="absolute left-2 top-1/2 p-3 text-3xl" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setI((i - 1 + images.length) % images.length); }}>‹</button>
            <button className="absolute right-2 top-1/2 p-3 text-3xl" aria-label="Next" onClick={(e) => { e.stopPropagation(); setI((i + 1) % images.length); }}>›</button>
          </>)}
        </div>
      )}
    </>
  );
}
