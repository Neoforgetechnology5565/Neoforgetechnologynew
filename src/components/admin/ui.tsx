"use client";
import { useEffect, useState, type ReactNode } from "react";

export const PageTitle = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{title}</h1><div className="flex gap-2">{children}</div></div>
);

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`border border-paper/15 bg-ink-900 p-4 sm:p-5 ${className}`}>{children}</div>
);

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-paper/40">{hint}</span>}</label>
);

/** Transient success/error toast driven by a message string. */
export function useToast() {
  const [t, setT] = useState<{ msg: string; err?: boolean } | null>(null);
  useEffect(() => { if (t) { const id = setTimeout(() => setT(null), 4500); return () => clearTimeout(id); } }, [t]);
  const el = t && <div role="status" className={`fixed bottom-4 left-4 right-4 z-[80] max-w-md px-4 py-3 text-sm shadow-xl sm:left-auto ${t.err ? "bg-red-600 text-white" : "bg-signal text-white"}`}>{t.msg}</div>;
  return { ok: (msg: string) => setT({ msg }), err: (e: unknown) => setT({ msg: (e as Error).message || "Error", err: true }), el };
}

export const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
