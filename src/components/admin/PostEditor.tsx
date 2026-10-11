"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import FileDrop from "@/components/FileDrop";
import { img } from "@/lib/cloudinary";
import { DIVISIONS } from "@/lib/divisions";
import { Markdown, readingMinutes } from "@/lib/markdown";
import type { MediaRef, Post } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";
import { api } from "./api";
import { Card, Field, PageTitle, useToast } from "./ui";
import VideoLinksField from "./VideoLinksField";

interface Form {
  title: string; slug: string; excerpt: string; content: string; cover: MediaRef[]; coverAlt: string; videoLinks: string[];
  tags: string; division: string; author: string; seoTitle: string; seoDescription: string; status: "draft" | "published";
}
const blank: Form = { title: "", slug: "", excerpt: "", content: "", cover: [], coverAlt: "", videoLinks: [], tags: "", division: "", author: "Neo Forge Team", seoTitle: "", seoDescription: "", status: "draft" };

export default function PostEditor({ id: initialId }: { id?: string }) {
  const [id, setId] = useState(initialId);
  const [f, setF] = useState<Form>(blank);
  const [loading, setLoading] = useState(!!initialId);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chosen, setChosen] = useState(!!initialId); // new articles start on the "manual or PDF" chooser
  const [importing, setImporting] = useState("");
  const [notes, setNotes] = useState<{ warnings: string[]; pages: number; words: number; headings: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!initialId) return;
    api<{ item: Post }>(`/api/admin/posts/${initialId}`).then(({ item: p }) => {
      setF({ title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, cover: p.cover ? [p.cover] : [], coverAlt: p.coverAlt, videoLinks: p.videoLinks, tags: p.tags.join(", "), division: p.division, author: p.author, seoTitle: p.seoTitle, seoDescription: p.seoDescription, status: p.status });
      setLoading(false);
    }).catch((e) => { toast.err(e); setLoading(false); });
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Wrap the selection (or insert a template) in the textarea. */
  function wrap(before: string, after = "", placeholder = "text") {
    const el = ta.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    flushSync(() => set("content", next)); // render now, so the selection below applies to the new text (no typing race)
    el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length);
  }
  function linePrefix(prefix: string) {
    const el = ta.current; if (!el) return;
    const { selectionStart: s, value } = el;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    flushSync(() => set("content", value.slice(0, start) + prefix + value.slice(start)));
    const caret = s + prefix.length;
    el.focus(); el.setSelectionRange(caret, caret);
  }
  async function insertImage(file: File) {
    setUploading(true);
    try {
      const m = await uploadToCloudinary(file, { kind: "image", folder: "blog" });
      const alt = prompt("Describe the image (for accessibility and search):", "") ?? "";
      const el = ta.current; const pos = el?.selectionStart ?? f.content.length;
      set("content", f.content.slice(0, pos) + `\n\n![${alt.replace(/[\]\n]/g, " ")}](${m.url})\n\n` + f.content.slice(pos));
    } catch (e) { toast.err(e); }
    setUploading(false);
  }

  /** Upload the PDF, let the server read it, then pre-fill the form (nothing is saved until the admin saves). */
  async function importPdf(file: File) {
    if (id && (f.title || f.content) && !confirm("This replaces the title, summary, text, tags and division with what is read from the PDF. Continue?")) return;
    try {
      setImporting("Uploading PDF…");
      const m = await uploadToCloudinary(file, { kind: "image", folder: "blog/imports" });
      setImporting("Reading the PDF…");
      const { item } = await api<{ item: { title: string; excerpt: string; content: string; tags: string[]; division: string; pages: number; words: number; headings: number; warnings: string[] } }>(
        "/api/admin/posts/import-pdf", "POST", { file: { ...m, name: file.name } });
      setF((x) => ({ ...x, title: item.title || x.title, excerpt: item.excerpt, content: item.content, tags: item.tags.join(", "), division: item.division, status: "draft" }));
      setNotes({ warnings: item.warnings, pages: item.pages, words: item.words, headings: item.headings });
      setChosen(true);
    } catch (e) { toast.err(e); }
    setImporting("");
  }

  async function save(status?: "draft" | "published") {
    setSaving(true);
    const body = {
      title: f.title, slug: f.slug || undefined, excerpt: f.excerpt, content: f.content, cover: f.cover[0] ?? null, coverAlt: f.coverAlt,
      videoLinks: f.videoLinks, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8), division: f.division,
      author: f.author, seoTitle: f.seoTitle, seoDescription: f.seoDescription, status: status ?? f.status,
    };
    try {
      const r = await api<{ id: string }>(id ? `/api/admin/posts/${id}` : "/api/admin/posts", id ? "PUT" : "POST", body);
      toast.ok(status === "published" ? "Published" : "Saved");
      if (!id) { setId(r.id); window.history.replaceState(null, "", `/admin/blog/${r.id}`); }
      if (status) set("status", status);
    } catch (e) { toast.err(e); }
    setSaving(false);
  }

  if (loading) return <p className="text-paper/50">Loading…</p>;
  const pdfPicker = <input ref={pdfInput} type="file" hidden accept=".pdf,application/pdf" data-testid="pdf-input" onChange={(e) => { const file = e.target.files?.[0]; if (file) importPdf(file); e.target.value = ""; }} />;
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDrag(true); },
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setDrag(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!/\.pdf$/i.test(file.name)) { toast.err(new Error("Please drop a PDF file")); return; }
      importPdf(file);
    },
  };
  if (!chosen) {
    return (
      <>
        <PageTitle title="New article"><Link href="/admin/blog" className="btn-ghost !py-2">Back</Link></PageTitle>
        <div className="max-w-3xl space-y-4">
          <div {...dropProps} role="button" tabIndex={0} onClick={() => !importing && pdfInput.current?.click()} onKeyDown={(e) => e.key === "Enter" && pdfInput.current?.click()}
            className={`cursor-pointer border-2 border-dashed p-10 text-center transition ${drag ? "border-forge bg-blue-50" : "border-paper/25 bg-ink-900 hover:border-forge"}`}>
            <p className="text-lg font-semibold">{importing || "Drop your PDF here, or click to choose it"}</p>
            <p className="mt-2 text-sm text-paper/60">{importing ? "This takes a few seconds — the article opens filled in automatically." : "It uploads and fills the title, summary, headings, text, tags and division by itself. You review before publishing."}</p>
          </div>
          <p className="text-center text-sm text-paper/60">or <button type="button" className="text-forge underline" onClick={() => setChosen(true)}>write it myself</button></p>
        </div>
        <p className="mt-4 max-w-3xl text-xs text-paper/50">Works with PDFs that contain real text (Word, Google Docs, exports). Scanned/photographed pages can&apos;t be read. Images and tables are not converted.</p>
        {pdfPicker}
        {toast.el}
      </>
    );
  }
  const tb = "border border-paper/20 px-2.5 py-1 text-xs hover:border-forge hover:text-forge";
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keeps the caret/selection in the text box when a toolbar button is pressed
  const words = f.content.split(/\s+/).filter(Boolean).length;

  return (
    <>
      <PageTitle title={id ? "Edit article" : "New article"}>
        <Link href="/admin/blog" className="btn-ghost !py-2">Back</Link>
        <button className="btn-ghost !py-2" disabled={saving || !f.title} onClick={() => save("draft")}>Save draft</button>
        <button className="btn-primary !py-2" disabled={saving || !f.title} onClick={() => save("published")}>{saving ? "Saving…" : "Save & publish"}</button>
      </PageTitle>
      <div {...dropProps} className={drag ? "outline outline-2 outline-forge" : ""}>
      {notes && (
        <div className="mb-5 border border-forge/40 bg-blue-50 p-4 text-sm" data-testid="import-banner">
          <p className="font-semibold">Filled from your PDF — {notes.pages} page{notes.pages === 1 ? "" : "s"}, {notes.words} words, {notes.headings} heading{notes.headings === 1 ? "" : "s"} found.</p>
          <p className="mt-1 text-paper/70">Please read it through, fix anything odd, add a cover image, then save. It is saved as a draft.</p>
          {notes.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-paper/70">{notes.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card className="grid gap-4">
            <Field label="Title *" hint="Put the phrase people search for near the start. About 50–60 characters is ideal."><input className="field" maxLength={160} value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <div className="flex flex-wrap items-center gap-3 text-xs text-paper/60">
              <button type="button" className="btn-ghost !py-1.5 !text-xs" disabled={!!importing} onClick={() => pdfInput.current?.click()}>{importing || (f.content || f.title ? "Re-fill from a PDF" : "Auto-fill from a PDF")}</button>
              <span>Reads the PDF and fills title, summary, text, tags and division.</span>
              {pdfPicker}
            </div>
            <Field label="Short summary" hint={`Shown on cards and in Google results (about 150 characters). ${f.excerpt.length}/300`}><textarea className="field" rows={2} maxLength={300} value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} /></Field>
          </Card>

          <Card>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button type="button" className={tb} onMouseDown={keep} onClick={() => linePrefix("## ")}>H2</button>
              <button type="button" className={tb} onMouseDown={keep} onClick={() => linePrefix("### ")}>H3</button>
              <button type="button" className={`${tb} font-bold`} onMouseDown={keep} onClick={() => wrap("**", "**")}>B</button>
              <button type="button" className={`${tb} italic`} onMouseDown={keep} onClick={() => wrap("*", "*")}>I</button>
              <button type="button" className={tb} onMouseDown={keep} onClick={() => { const u = prompt("Link address (https://… or /page):", "https://"); if (u) wrap("[", `](${u})`, "link text"); }}>Link</button>
              <button type="button" className={tb} onMouseDown={keep} onClick={() => linePrefix("- ")}>• List</button>
              <button type="button" className={tb} onMouseDown={keep} onClick={() => linePrefix("1. ")}>1. List</button>
              <button type="button" className={tb} onMouseDown={keep} onClick={() => linePrefix("> ")}>Quote</button>
              <button type="button" className={tb} disabled={uploading} onClick={() => imgInput.current?.click()}>{uploading ? "Uploading…" : "Image"}</button>
              <input ref={imgInput} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.gif" onChange={(e) => { const file = e.target.files?.[0]; if (file) insertImage(file); e.target.value = ""; }} />
              <span className="ml-auto flex gap-1"><button type="button" className={`${tb} ${!preview ? "!border-forge !text-forge" : ""}`} onClick={() => setPreview(false)}>Write</button><button type="button" className={`${tb} ${preview ? "!border-forge !text-forge" : ""}`} onClick={() => setPreview(true)}>Preview</button></span>
            </div>
            {preview ? (
              <div className="min-h-[24rem] rounded-none border border-paper/15 bg-white p-5"><Markdown source={f.content || "*Nothing to preview yet.*"} /></div>
            ) : (
              <textarea ref={ta} className="field font-mono !text-[13px] leading-relaxed" rows={22} value={f.content} onChange={(e) => set("content", e.target.value)} placeholder={"Write your article here.\n\n## A heading\nParagraphs are separated by a blank line. Use **bold**, *italic*, [links](https://example.com), lists with - and numbered lists with 1."} />
            )}
            <p className="mt-2 text-xs text-paper/50">{words} words · about {readingMinutes(f.content)} min read. Aim for 800+ words on one specific topic. Raw HTML is not allowed.</p>
          </Card>

          <Card className="space-y-5">
            <h2 className="font-semibold">Media</h2>
            <FileDrop label="Cover image" accept=".jpg,.jpeg,.png,.webp" kind="image" folder="blog" value={f.cover} onChange={(v) => set("cover", v)} hint="Wide image, at least 1200 × 630 px. Also used as the share preview." />
            {f.cover[0] && <img src={img(f.cover[0], { w: 480 })} alt="Cover preview" className="max-h-40 border border-paper/15" />}
            <Field label="Cover image description" hint="Describe the picture (accessibility + search)"><input className="field" maxLength={200} value={f.coverAlt} onChange={(e) => set("coverAlt", e.target.value)} /></Field>
            <VideoLinksField value={f.videoLinks} onChange={(v) => set("videoLinks", v)} />
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card className="space-y-4">
            <Field label="Status"><select className="field" value={f.status} onChange={(e) => set("status", e.target.value as Form["status"])}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
            <Field label="URL slug" hint="Leave blank to build it from the title"><input className="field" value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto" /></Field>
            <Field label="Author"><input className="field" maxLength={80} value={f.author} onChange={(e) => set("author", e.target.value)} /></Field>
            <Field label="Related division" hint="Adds links to that service page and lists this article there"><select className="field" value={f.division} onChange={(e) => set("division", e.target.value)}><option value="">— none —</option>{DIVISIONS.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></Field>
            <Field label="Tags" hint="Comma separated, up to 8"><input className="field" value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Revit, automation, BIM" /></Field>
            <button className="btn-primary w-full" disabled={saving || !f.title} onClick={() => save()}>{saving ? "Saving…" : "Save changes"}</button>
            {id && f.status === "published" && <Link href={`/blog/${f.slug}`} target="_blank" className="block text-center text-sm text-forge hover:underline">View public article ↗</Link>}
          </Card>
          <Card className="space-y-4">
            <h2 className="font-semibold">Search appearance (optional)</h2>
            <Field label="Search title" hint={`Blank = article title. ${f.seoTitle.length}/70`}><input className="field" maxLength={70} value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></Field>
            <Field label="Search description" hint={`Blank = short summary. ${f.seoDescription.length}/170`}><textarea className="field" rows={3} maxLength={170} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></Field>
            <div className="border border-paper/15 bg-white p-3 text-left">
              <p className="truncate text-sm text-blue-700">{f.seoTitle || f.title || "Article title"}</p>
              <p className="truncate text-xs text-green-700">neoforgetechnologies.com › blog › {f.slug || "your-article"}</p>
              <p className="line-clamp-2 text-xs text-stone-600">{f.seoDescription || f.excerpt || "Your summary appears here."}</p>
            </div>
          </Card>
        </aside>
      </div>
      </div>
      {toast.el}
    </>
  );
}
