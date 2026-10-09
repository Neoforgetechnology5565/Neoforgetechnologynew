"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import FileDrop from "@/components/FileDrop";
import { api } from "@/components/admin/api";
import { Card, PageTitle, useToast } from "@/components/admin/ui";
import { iconUrl, logoUrl } from "@/lib/cloudinary";
import type { Branding, MediaRef } from "@/lib/types";

type Slot = "logoLight" | "logoDark" | "icon";

export default function BrandingPage() {
  const [b, setB] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { api<{ item: Branding }>("/api/admin/content/branding").then((r) => setB(r.item)).catch(toast.err); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <p className="text-paper/50">Loading…</p>;

  const set = (slot: Slot, v: MediaRef[]) => setB({ ...b, [slot]: v[0] ?? null });
  async function save() {
    setSaving(true);
    try { await api("/api/admin/content/branding", "PUT", b); toast.ok("Saved — the website now uses these"); } catch (e) { toast.err(e); }
    setSaving(false);
  }
  const Guide = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-xs text-paper/50">{children}</p>;

  return (
    <>
      <PageTitle title="Branding"><button className="btn-primary !py-2" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save branding"}</button></PageTitle>
      <p className="mb-5 max-w-3xl text-sm text-paper/60">Upload your logos and icon here. Changes appear on the whole website straight away. Until you upload something, the site shows a text version of the name.</p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Logo for light backgrounds</h2>
          <Guide>Dark lettering. Shown in the <b>header</b> (white bar at the top of every page).</Guide>
          <div className="mt-4"><FileDrop label="Upload logo" accept=".png,.webp,.jpg,.jpeg,.svg" kind="image" folder="branding" value={b.logoLight ? [b.logoLight] : []} onChange={(v) => set("logoLight", v)} hint="PNG (transparent), WEBP or SVG" /></div>
          <div className="mt-4 border border-paper/15 bg-white p-4">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-stone-400">Preview as in the header</p>
            {b.logoLight ? <img src={logoUrl(b.logoLight, { h: 44, trim: b.autoTrim })} alt="Light-background logo preview" style={{ height: 44, width: "auto", maxWidth: "100%" }} /> : <p className="text-sm text-stone-400">Nothing uploaded — text name shown.</p>}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Logo for dark backgrounds</h2>
          <Guide>White lettering. Shown in the <b>footer</b> (dark band at the bottom of every page).</Guide>
          <div className="mt-4"><FileDrop label="Upload logo" accept=".png,.webp,.jpg,.jpeg,.svg" kind="image" folder="branding" value={b.logoDark ? [b.logoDark] : []} onChange={(v) => set("logoDark", v)} hint="PNG (transparent), WEBP or SVG" /></div>
          <div className="mt-4 border border-paper/15 bg-slate-950 p-4">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Preview as in the footer</p>
            {b.logoDark ? <img src={logoUrl(b.logoDark, { h: 44, trim: b.autoTrim })} alt="Dark-background logo preview" style={{ height: 44, width: "auto", maxWidth: "100%" }} /> : <p className="text-sm text-slate-500">Nothing uploaded — text name shown.</p>}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h2 className="font-semibold">Icon (favicon &amp; app icon)</h2>
          <Guide>Square symbol only, no lettering. Used for the browser tab, bookmarks and when the site is saved to a phone home screen.</Guide>
          <div className="mt-4 grid gap-5 md:grid-cols-[1fr_1.2fr]">
            <FileDrop label="Upload icon" accept=".png,.webp,.jpg,.jpeg" kind="image" folder="branding" value={b.icon ? [b.icon] : []} onChange={(v) => set("icon", v)} hint="Square PNG, at least 512 × 512 px" />
            <div className="flex items-end gap-5 border border-paper/15 bg-ink-800 p-4">
              {b.icon ? ([16, 32, 64, 120] as const).map((s) => (
                <figure key={s} className="text-center"><img src={iconUrl(b.icon, s * 2)} alt={`${s} pixel icon preview`} width={s} height={s} style={{ width: s, height: s }} /><figcaption className="mt-1 text-[10px] text-paper/50">{s}px</figcaption></figure>
              )) : <p className="text-sm text-paper/50">Nothing uploaded.</p>}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={b.autoTrim} onChange={(e) => setB({ ...b, autoTrim: e.target.checked })} />
            <span><b>Automatically crop empty space around the logos</b><br /><span className="text-paper/60">Logos exported on a large canvas with wide margins (a common case) are trimmed so they display at the right size. Turn this off if a logo looks cut off.</span></span></label>
          <h3 className="mt-6 font-semibold">Recommended files</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-paper/70">
            <li><b>Logos:</b> transparent <b>PNG</b> or <b>SVG</b> (best), about <b>1200 px wide</b> or more, wide shape. Under 15 MB.</li>
            <li><b>Two versions:</b> dark-lettering for the white header, white-lettering for the dark footer. A logo with a solid black or white background also works, because the empty margin is cropped, but transparent is cleaner.</li>
            <li><b>Icon:</b> square PNG, <b>512 × 512 px</b> or larger, simple shape that stays readable when tiny.</li>
            <li>Browser tabs may keep showing the old icon for a while after a change; refresh with Ctrl+F5.</li>
          </ul>
        </Card>
      </div>
      <div className="mt-5"><button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save branding"}</button></div>
      {toast.el}
    </>
  );
}
