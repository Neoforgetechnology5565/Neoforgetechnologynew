/** Shared class names and helpers for the demo applications. */
export const FIELD = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500";
export const LBL = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500";
export const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-4";
export const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white";
export const PRIMARY = "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500";
export const H3 = "text-[11px] font-semibold uppercase tracking-wider text-slate-400";
export const SEV: Record<string, string> = { error: "bg-red-500/15 text-red-300", warning: "bg-amber-500/15 text-amber-300", info: "bg-blue-500/15 text-blue-300" };
export const pill = (on: boolean) => `rounded px-2.5 py-1 text-xs font-medium ${on ? "bg-blue-600 text-white" : "bg-slate-900/90 text-slate-300 hover:bg-slate-800"}`;

export function download(name: string, text: string, type = "text/plain") {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}
export const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
export const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
