"use client";
import type { MediaRef } from "./types";

export type UploadKind = "image" | "video" | "raw";

export const LIMITS: Record<UploadKind, number> = { image: 15 * 1024 * 1024, video: 100 * 1024 * 1024, raw: 50 * 1024 * 1024 };

/** Decide which Cloudinary resource type a file belongs to from its extension. */
export function kindOf(file: File): UploadKind {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "webp", "gif", "svg", "pdf"].includes(ext)) return "image";
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  return "raw";
}

/**
 * 1. ask our API for a signature  2. upload straight to Cloudinary  3. return the reference to store in Firestore.
 * `endpoint` is the admin signer by default; visitors use the restricted public signer.
 */
export async function uploadToCloudinary(
  file: File,
  opts: { endpoint?: string; folder?: string; kind?: UploadKind; onProgress?: (pct: number) => void } = {},
): Promise<MediaRef> {
  const kind = opts.kind ?? kindOf(file);
  if (file.size > LIMITS[kind]) throw new Error(`${file.name} is too large (max ${LIMITS[kind] / 1048576} MB)`);

  const sigRes = await fetch(opts.endpoint ?? "/api/admin/upload-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, folder: opts.folder }),
  });
  if (!sigRes.ok) throw new Error((await sigRes.json().catch(() => ({}))).error || "Could not authorise upload");
  const s = await sigRes.json();

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", s.apiKey);
  form.append("timestamp", String(s.timestamp));
  form.append("signature", s.signature);
  form.append("folder", s.folder);
  form.append("allowed_formats", s.allowed_formats);

  const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${s.cloudName}/${s.resourceType}/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(json);
      else reject(new Error((json.error as { message?: string } | undefined)?.message || "Upload rejected by Cloudinary"));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });

  return {
    url: data.secure_url as string,
    publicId: data.public_id as string,
    resourceType: data.resource_type as MediaRef["resourceType"],
    format: (data.format as string) || file.name.split(".").pop()?.toLowerCase(),
    bytes: data.bytes as number,
    name: file.name,
    width: data.width as number | undefined,
    height: data.height as number | undefined,
  };
}
