import "server-only";

/** Returns a plain-English problem with the Cloudinary env vars, or null when they look right. Never returns the values. */
export function cloudinaryConfigProblem(): string | null {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return "Cloudinary is not configured (missing variable).";
  if (!/^\d{6,20}$/.test(key.trim())) return "CLOUDINARY_API_KEY should be the numeric API Key (digits only). It looks like a different value — probably the API Secret — was pasted into it.";
  if (/^\d+$/.test(secret.trim())) return "CLOUDINARY_API_SECRET looks like the numeric API Key. Put the API Secret (letters and numbers) there.";
  if (/[\s"']/.test(key + secret + cloud)) return "A Cloudinary variable contains spaces or quote marks. Re-enter it without them.";
  return null;
}
