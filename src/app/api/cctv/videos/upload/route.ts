import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { capabilities, cleanupUploads, fail, HttpError, limit, newId, sameOrigin, uploadPath } from "@/lib/cctv/server";
import { sniffVideo } from "@/lib/cctv/video";
import { LIMITS } from "@/lib/cctv/types";

export const runtime = "nodejs";
const MAX = LIMITS.maxUploadMb * 1024 * 1024;
const MAX_DURATION = 180;

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    limit(req, "upload", 6, 10 * 60_000);
    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX + 64 * 1024) throw new HttpError(413, `File too large. The limit is ${LIMITS.maxUploadMb} MB.`);
    const form = await req.formData().catch(() => { throw new HttpError(400, "Expected multipart/form-data with a 'file' field"); });
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file received");
    if (file.size === 0) throw new HttpError(400, "The file is empty");
    if (file.size > MAX) throw new HttpError(413, `File too large. The limit is ${LIMITS.maxUploadMb} MB.`);
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniffVideo(buf.subarray(0, 16));
    if (!kind) throw new HttpError(415, "Unsupported file. Upload an MP4 or WebM video (the file contents are checked, not the file name).");
    cleanupUploads();
    const videoId = newId();
    const p = uploadPath(videoId, kind);
    writeFileSync(p, buf, { mode: 0o600 });
    let probe: { durationSec: number; width: number; height: number } | null = null;
    if (capabilities().ffprobe) {
      const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", p], { timeout: 15_000 });
      try {
        const j = JSON.parse(r.stdout.toString());
        probe = { durationSec: Number(j.format?.duration), width: j.streams?.[0]?.width, height: j.streams?.[0]?.height };
      } catch { /* handled below */ }
      if (!probe || !(probe.durationSec > 0) || !probe.width) { const { unlinkSync } = await import("node:fs"); unlinkSync(p); throw new HttpError(422, "The video could not be decoded. It may be corrupt or use an unsupported codec."); }
      if (probe.durationSec > MAX_DURATION) { const { unlinkSync } = await import("node:fs"); unlinkSync(p); throw new HttpError(413, `Video too long (${Math.round(probe.durationSec)} s). The demo limit is ${MAX_DURATION} s.`); }
    }
    return NextResponse.json({ videoId, bytes: buf.length, kind, probe, retention: "Uploaded files are kept in temporary storage for at most 60 minutes and then deleted.", note: probe ? undefined : "ffprobe is not available on this host; duration and size will be read by your browser." });
  } catch (e) { return fail(e); }
}
