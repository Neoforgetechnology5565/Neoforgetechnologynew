"use client";
import { useEffect, useState } from "react";

export interface HeroSlide { url: string; title: string }

/** Cross-fading background of featured project covers (Cloudinary-optimised URLs). */
export default function HeroSlideshow({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setActive((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);
  if (!slides.length) return null;
  return (
    <div className="absolute inset-0">
      {slides.map((s, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={s.url} src={s.url} alt="" aria-hidden loading={i === 0 ? "eager" : "lazy"} decoding="async"
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-opacity duration-1000" style={{ opacity: i === active ? 0.4 : 0 }} />
      ))}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {slides.map((s, i) => <button key={s.url} type="button" onClick={() => setActive(i)} aria-label={`Show slide ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-blue-400" : "w-1.5 bg-slate-500/60 hover:bg-slate-400"}`} />)}
        </div>
      )}
    </div>
  );
}
