"use client";
import type { ReactNode } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";

/** White, green-accented workspace used by the medical-imaging and smart-farming demos, inside the standard demo header (official logo). */
export const G = { primary: "#16834A", dark: "#11643A", light: "#E9F7EF" };
export const L_BTN = "rounded-md border border-[#16834A] px-3 py-1.5 text-[13px] font-medium text-[#11643A] hover:bg-[#E9F7EF] disabled:opacity-40";
export const L_GO = "rounded-md bg-[#16834A] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#11643A] disabled:opacity-40";
export const L_CARD = "rounded-lg border border-emerald-200 bg-white p-4 shadow-sm";
export const L_H3 = "mb-2 text-[13px] font-semibold uppercase tracking-wider text-[#11643A]";

export default function LightShell({ branding, title, project, status, notice, footer, children }: { branding: Branding; title: string; project: string; status: string; notice: string; footer: string; children: ReactNode }) {
  return (
    <DemoShell branding={branding} app={title} project={project} status={status} badge="Computer Vision · prototype" back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision" footer={footer}>
      <div className="bg-white text-slate-800" style={{ fontFamily: "Georgia, serif", fontSize: 15 }}>
        <div className="mx-auto max-w-[1500px] space-y-4 p-3 sm:p-5">
          <div role="note" className="rounded-lg border border-emerald-300 bg-[#E9F7EF] px-4 py-2.5 text-[14px] leading-snug text-[#11643A]" data-testid="notice">{notice}</div>
          {children}
        </div>
      </div>
    </DemoShell>
  );
}
