/** Container sniffing by magic bytes: the file extension and the client-declared type are never trusted. */
export type VideoKind = "mp4" | "webm";
export function sniffVideo(b: Uint8Array): VideoKind | null {
  if (b.length < 12) return null;
  const s = (o: number, t: string) => t.split("").every((c, k) => b[o + k] === c.charCodeAt(0));
  if (s(4, "ftyp")) return "mp4"; // ISO BMFF: mp4 / m4v / mov-compatible brands
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm"; // EBML: webm / mkv
  return null;
}
export const VIDEO_MIME: Record<VideoKind, string> = { mp4: "video/mp4", webm: "video/webm" };
