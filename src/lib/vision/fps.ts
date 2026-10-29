"use client";
/** Measure the frame rate from the browser's own frame callbacks while the clip plays briefly; null when the browser cannot report it. */
export async function probeFps(v: HTMLVideoElement): Promise<number | null> {
  const vf = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (n: number, m: { mediaTime: number }) => void) => number }; if (!vf.requestVideoFrameCallback) return null;
  return new Promise<number | null>((res) => { const times: number[] = []; const step = (_: number, m: { mediaTime: number }) => { times.push(m.mediaTime); if (times.length >= 12) { v.pause(); const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0).sort((a, b) => a - b); res(d.length ? 1 / d[Math.floor(d.length / 2)] : null); } else vf.requestVideoFrameCallback!(step); }; vf.requestVideoFrameCallback!(step); v.currentTime = 0; v.muted = true; v.play().catch(() => res(null)); setTimeout(() => { v.pause(); res(times.length >= 4 ? (() => { const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0).sort((a, b) => a - b); return d.length ? 1 / d[Math.floor(d.length / 2)] : null; })() : null); }, 2500); });
}
export const snapFps = (f: number) => { const c = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60].reduce((b, x) => (Math.abs(x - f) < Math.abs(b - f) ? x : b), 25); return Math.abs(c - f) / c < 0.01 ? c : Math.round(f * 100) / 100; };
