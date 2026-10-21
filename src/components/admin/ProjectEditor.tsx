"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import FileDrop from "@/components/FileDrop";
import { img, isPdf, pdfThumb } from "@/lib/cloudinary";
import { DIVISION_MAP, DIVISIONS } from "@/lib/divisions";
import { parseVideo } from "@/lib/video";
import type { Category, MediaRef, Project } from "@/lib/types";
import { api } from "./api";
import { Card, Field, PageTitle, lines, useToast } from "./ui";
import VideoLinksField from "./VideoLinksField";

interface Form {
  title: string; slug: string; division: string; categoryId: string; summary: string; description: string;
  cover: MediaRef[]; gallery: MediaRef[]; documents: MediaRef[]; files: MediaRef[]; video: MediaRef[]; videoLinks: string[];
  technologies: string; features: string; challenge: string; solution: string; results: string; pipeline: string;
  featured: boolean; status: "draft" | "published"; order: number;
}
const blank: Form = {
  title: "", slug: "", division: "computer-vision", categoryId: "", summary: "", description: "", cover: [], gallery: [], documents: [], files: [], video: [], videoLinks: [],
  technologies: "", features: "", challenge: "", solution: "", results: "", pipeline: "", featured: false, status: "draft", order: 0,
};

export default function ProjectEditor({ id: initialId }: { id?: string }) {
  const [id, setId] = useState(initialId);
  const [f, setF] = useState<Form>(blank);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!!initialId);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  // "Auto-fill from a video link": you pick which fields it may fill
  const VF_FIELDS: [string, string][] = [["title", "Project title"], ["description", "Project description"], ["summary", "Short summary"], ["technologies", "Technologies"], ["features", "Key features"], ["challenge", "Challenge"], ["solution", "Solution"], ["results", "Results"], ["cover", "Cover image (the video's thumbnail)"], ["category", "Division & sub-category"]];
  const [vfUrl, setVfUrl] = useState("");
  const [vfPick, setVfPick] = useState<Set<string>>(new Set(["title", "description", "summary"]));
  const [vfBusy, setVfBusy] = useState(false);
  const [vfNote, setVfNote] = useState<{ filled: string[]; warnings: string[]; ai: boolean } | null>(null);
  const togglePick = (k: string) => setVfPick((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function scanVideo() {
    const url = vfUrl.trim() || f.videoLinks[0] || "";
    if (!parseVideo(url)) { toast.err(new Error("Paste a YouTube or Vimeo link first.")); return; }
    if (!vfPick.size) { toast.err(new Error("Tick at least one field to fill.")); return; }
    const current: Record<string, string> = { title: f.title, description: f.description, summary: f.summary, technologies: f.technologies, features: f.features, challenge: f.challenge, solution: f.solution, results: f.results, cover: f.cover.length ? "x" : "", category: f.categoryId };
    const filled = VF_FIELDS.filter(([k]) => vfPick.has(k) && current[k].trim());
    if (filled.length && !confirm(`This replaces what is already in: ${filled.map(([, l]) => l).join(", ")}. Continue?`)) return;
    setVfBusy(true); setVfNote(null);
    try {
      const { item } = await api<{ item: { project: { title: string; summary: string; description: string; challenge: string; solution: string; results: string; technologies: string[]; features: string[]; division: string }; category: string; cover: MediaRef | null; ai: boolean; warnings: string[] } }>("/api/admin/projects/from-video", "POST", { url, cover: vfPick.has("cover") });
      const p = item.project; const did: string[] = [];
      setF((x) => {
        const n = { ...x };
        const put = (k: string, label: string, apply: () => void, ok: boolean) => { if (vfPick.has(k) && ok) { apply(); did.push(label); } };
        put("title", "Project title", () => { n.title = p.title; }, !!p.title);
        put("description", "Project description", () => { n.description = p.description; }, !!p.description);
        put("summary", "Short summary", () => { n.summary = p.summary; }, !!p.summary);
        put("technologies", "Technologies", () => { n.technologies = p.technologies.join("\n"); }, p.technologies.length > 0);
        put("features", "Key features", () => { n.features = p.features.join("\n"); }, p.features.length > 0);
        put("challenge", "Challenge", () => { n.challenge = p.challenge; }, !!p.challenge);
        put("solution", "Solution", () => { n.solution = p.solution; }, !!p.solution);
        put("results", "Results", () => { n.results = p.results; }, !!p.results);
        put("cover", "Cover image", () => { n.cover = [item.cover!]; }, !!item.cover);
        put("category", "Division & sub-category", () => { n.division = p.division; const c = cats.find((c) => c.division === p.division && c.slug === item.category); n.categoryId = c?.id ?? ""; n.pipeline = ""; }, !!p.division);
        if (!n.videoLinks.some((l) => parseVideo(l)?.watchUrl === parseVideo(url)?.watchUrl) && n.videoLinks.length < 6) n.videoLinks = [...n.videoLinks, url];
        return n;
      });
      setVfNote({ filled: did, warnings: item.warnings, ai: item.ai });
    } catch (e) { toast.err(e); }
    setVfBusy(false);
  }

  useEffect(() => {
    api<{ items: Category[] }>("/api/admin/categories").then((r) => setCats(r.items)).catch(toast.err);
    if (initialId) api<{ item: Project }>(`/api/admin/projects/${initialId}`).then(({ item: p }) => {
      setF({ title: p.title, slug: p.slug, division: p.division, categoryId: p.categoryId, summary: p.summary, description: p.description, cover: p.cover ? [p.cover] : [], gallery: p.gallery, documents: p.documents, files: p.files, video: p.video ? [p.video] : [], videoLinks: p.videoLinks, technologies: p.technologies.join("\n"), features: p.features.join("\n"), challenge: p.challenge, solution: p.solution, results: p.results, pipeline: p.pipeline.join(", "), featured: p.featured, status: p.status, order: p.order });
      setLoading(false);
    }).catch((e) => { toast.err(e); setLoading(false); });
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(status?: "draft" | "published") {
    setSaving(true);
    const body = {
      title: f.title, slug: f.slug || undefined, division: f.division, categoryId: f.categoryId, summary: f.summary, description: f.description,
      cover: f.cover[0] ?? null, gallery: f.gallery, documents: f.documents, files: f.files, video: f.video[0] ?? null, videoUrl: "", videoLinks: f.videoLinks,
      technologies: lines(f.technologies), features: lines(f.features), challenge: f.challenge, solution: f.solution, results: f.results,
      pipeline: f.pipeline.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6),
      featured: f.featured, status: status ?? f.status, order: f.order,
    };
    try {
      const r = await api<{ id: string }>(id ? `/api/admin/projects/${id}` : "/api/admin/projects", id ? "PUT" : "POST", body);
      toast.ok(status === "published" ? "Published" : "Saved");
      if (!id) { setId(r.id); window.history.replaceState(null, "", `/admin/projects/${r.id}`); } // stay mounted so the toast and form state survive
      if (status) set("status", status);
    } catch (e) { toast.err(e); }
    setSaving(false);
  }

  if (loading) return <p className="text-paper/50">Loading…</p>;
  const divCats = cats.filter((c) => c.division === f.division);

  return (
    <>
      <PageTitle title={id ? "Edit project" : "New project"}>
        <Link href="/admin/projects" className="btn-ghost !py-2">Back</Link>
        <button className="btn-ghost !py-2" disabled={saving || !f.title} onClick={() => save("draft")}>Save draft</button>
        <button className="btn-primary !py-2" disabled={saving || !f.title} onClick={() => save("published")}>{saving ? "Saving…" : "Save & publish"}</button>
      </PageTitle>
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Title *"><input className="field" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={160} /></Field></div>
            <Field label="URL slug" hint="Leave blank to generate from the title"><input className="field" value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto" /></Field>
            <Field label="Division *"><select className="field" value={f.division} onChange={(e) => setF({ ...f, division: e.target.value, categoryId: "", pipeline: "" })}>{DIVISIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></Field>
            <Field label="Sub-category"><select className="field" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}><option value="">— none —</option>{divCats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.enabled ? "" : " (disabled)"}</option>)}</select></Field>
            <Field label="Solution flow" hint={`Up to 6 steps, comma separated. Default: ${DIVISION_MAP[f.division].pipeline.join(" → ")}`}><input className="field" value={f.pipeline} onChange={(e) => set("pipeline", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Short summary" hint="Shown on cards and in search results (max 400 chars)"><textarea className="field" rows={2} maxLength={400} value={f.summary} onChange={(e) => set("summary", e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label="Overview / description"><textarea className="field" rows={6} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
          </Card>
          <Card className="space-y-4" data-testid="video-autofill">
            <div>
              <h2 className="font-semibold">Auto-fill from a video link</h2>
              <p className="mt-1 text-sm text-paper/65">Paste a YouTube or Vimeo link, choose what it may fill in, and we read the video&apos;s title, description and captions and write those fields for you. You can edit everything afterwards. Nothing is saved until you click Save.</p>
            </div>
            <Field label="Video link"><input className="field" value={vfUrl} onChange={(e) => setVfUrl(e.target.value)} placeholder={f.videoLinks[0] || "https://www.youtube.com/watch?v=…"} aria-label="Video link to scan" /></Field>
            <div>
              <span className="label">Fill these fields</span>
              <div className="mt-1 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">{VF_FIELDS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vfPick.has(k)} onChange={() => togglePick(k)} /> {l}</label>)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary !py-2" onClick={scanVideo} disabled={vfBusy}>{vfBusy ? "Reading the video…" : "Scan video and fill"}</button>
              {vfBusy && <span className="text-xs text-paper/60" role="status">This takes a few seconds.</span>}
            </div>
            {vfNote && (
              <div className="border border-forge/40 bg-blue-50 p-3 text-sm" data-testid="video-autofill-note">
                <p className="font-semibold">{vfNote.filled.length ? `Filled: ${vfNote.filled.join(", ")}.` : "Nothing could be filled from this video."}</p>
                <p className="mt-1 text-paper/70">Please read it through and correct anything that isn&apos;t right before you publish.{vfNote.ai ? " Written by AI from the video's own information; it only uses what the video says." : ""}</p>
                {vfNote.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-paper/70">{vfNote.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
              </div>
            )}
          </Card>

          <Card className="grid gap-4">
            <Field label="Challenge"><textarea className="field" rows={4} value={f.challenge} onChange={(e) => set("challenge", e.target.value)} /></Field>
            <Field label="Solution"><textarea className="field" rows={4} value={f.solution} onChange={(e) => set("solution", e.target.value)} /></Field>
            <Field label="Results" hint="Only include outcomes you can stand behind"><textarea className="field" rows={3} value={f.results} onChange={(e) => set("results", e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Features" hint="One per line"><textarea className="field" rows={6} value={f.features} onChange={(e) => set("features", e.target.value)} /></Field>
              <Field label="Technology stack" hint="One per line"><textarea className="field" rows={6} value={f.technologies} onChange={(e) => set("technologies", e.target.value)} /></Field>
            </div>
          </Card>

          <Card className="space-y-5">
            <h2 className="font-semibold">Media (stored on Cloudinary)</h2>
            <FileDrop label="Cover image" accept=".jpg,.jpeg,.png,.webp" kind="image" folder="projects" value={f.cover} onChange={(v) => set("cover", v)} hint="JPG / PNG / WEBP, up to 15 MB" />
            {f.cover[0] && <img src={img(f.cover[0], { w: 480 })} alt="Cover preview" className="max-h-40 border border-paper/15" />}
            <FileDrop label="Gallery images" accept=".jpg,.jpeg,.png,.webp" multiple max={60} kind="image" folder="projects" value={f.gallery} onChange={(v) => set("gallery", v)} />
            {f.gallery.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {f.gallery.map((m, i) => (
                  <li key={m.publicId} className="relative">
                    <img src={img(m, { w: 200, h: 150 })} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 text-xs">
                      <button type="button" aria-label="Move earlier" className="px-2 py-1" onClick={() => { if (i > 0) { const g = [...f.gallery]; [g[i - 1], g[i]] = [g[i], g[i - 1]]; set("gallery", g); } }}>←</button>
                      <button type="button" aria-label="Move later" className="px-2 py-1" onClick={() => { if (i < f.gallery.length - 1) { const g = [...f.gallery]; [g[i + 1], g[i]] = [g[i], g[i + 1]]; set("gallery", g); } }}>→</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <FileDrop label="PDF documents" accept=".pdf" multiple max={20} kind="image" folder="documents" value={f.documents} onChange={(v) => set("documents", v)} hint="PDFs get an automatic first-page thumbnail" />
            {f.documents.some(isPdf) && (
              <ul className="flex flex-wrap gap-2">{f.documents.filter(isPdf).map((m) => <li key={m.publicId}><img src={pdfThumb(m, 160)} alt={`Preview of ${m.name}`} className="h-24 border border-paper/15 bg-white" /></li>)}</ul>
            )}
            <FileDrop label="Additional files" accept=".zip,.dwg,.dxf,.rvt,.rfa,.skp,.rbz,.ifc,.json,.csv,.txt,.docx,.xlsx,.pptx,.dll,.bundle" multiple max={20} kind="raw" folder="files" value={f.files} onChange={(v) => set("files", v)} hint="Up to 50 MB each" />
            <FileDrop label="Or upload a video file" accept=".mp4,.webm,.mov" kind="video" folder="video" value={f.video} onChange={(v) => set("video", v)} hint="MP4 / WEBM / MOV up to 100 MB" />
            <VideoLinksField value={f.videoLinks} onChange={(v) => set("videoLinks", v)} />
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="space-y-4">
            <Field label="Status"><select className="field" value={f.status} onChange={(e) => set("status", e.target.value as Form["status"])}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured on homepage</label>
            <Field label="Order" hint="Lower numbers appear first"><input type="number" className="field" value={f.order} onChange={(e) => set("order", Number(e.target.value) || 0)} /></Field>
            <button className="btn-primary w-full" disabled={saving || !f.title} onClick={() => save()}>{saving ? "Saving…" : "Save changes"}</button>
            {id && f.status === "published" && <Link href={`/portfolio/${f.division}/${f.slug}`} target="_blank" className="block text-center text-sm text-forge hover:underline">View public page ↗</Link>}
          </Card>
        </aside>
      </div>
      {toast.el}
    </>
  );
}
