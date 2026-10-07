"use client";
export async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = "/admin/login"; throw new Error("Session expired"); }
  if (!res.ok) {
    const detail = Array.isArray(json.issues) ? ": " + json.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".")} ${i.message}`).join("; ") : "";
    throw new Error((json.error || "Request failed") + detail);
  }
  return json as T;
}
