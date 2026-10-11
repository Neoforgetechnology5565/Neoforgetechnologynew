import type { ReactNode } from "react";
import { slugify } from "./utils";

/**
 * Small, safe Markdown subset → React elements. Raw HTML is never rendered (no dangerouslySetInnerHTML), links are
 * restricted to http(s)/mailto/relative, and images must be hosted on Cloudinary.
 * Supports: ## / ### headings, paragraphs, **bold**, *italic*, `code`, [links](url), ![images](url), - / 1. lists, > quotes, ``` code, ---.
 */
const safeHref = (u: string) => (/^(https?:\/\/|mailto:|\/|#)/i.test(u.trim()) ? u.trim() : "");
const cloudImg = (u: string) => /^https:\/\/res\.cloudinary\.com\//i.test(u.trim());

export function inline(src: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  // order matters: images, links, code, bold, italic
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?!\*)|(?<![\w])_([^_\n]+)_(?![\w])/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const k = `${keyPrefix}${n++}`;
    if (m[2] !== undefined) {
      // eslint-disable-next-line @next/next/no-img-element
      out.push(cloudImg(m[2]) ? <img key={k} src={m[2]} alt={m[1]} loading="lazy" decoding="async" className="my-6 h-auto max-w-full rounded-2xl border border-stone-200" /> : m[1]);
    } else if (m[4] !== undefined) {
      const href = safeHref(m[4]);
      const external = /^https?:\/\//i.test(href);
      out.push(href ? <a key={k} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700">{inline(m[3], k + "-")}</a> : m[3]);
    } else if (m[5] !== undefined) out.push(<code key={k} className="rounded bg-stone-100 px-1.5 py-0.5 text-[0.9em] text-stone-800">{m[5]}</code>);
    else if (m[6] !== undefined) out.push(<strong key={k} className="font-semibold text-stone-900">{inline(m[6], k + "-")}</strong>);
    else out.push(<em key={k}>{inline((m[7] ?? m[8]) as string, k + "-")}</em>);
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export interface Heading { level: 2 | 3; text: string; id: string }

/** Plain-text headings, used for the table of contents. */
export function headingsOf(md: string): Heading[] {
  const hs: Heading[] = [];
  let fence = false;
  for (const line of md.split("\n")) {
    if (line.trim().startsWith("```")) fence = !fence;
    if (fence) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (m) { const text = m[2].replace(/[*_`]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); hs.push({ level: m[1].length === 3 ? 3 : 2, text, id: slugify(text) }); }
  }
  return hs;
}

export const readingMinutes = (md: string) => Math.max(1, Math.round(md.split(/\s+/).filter(Boolean).length / 200));

export function Markdown({ source }: { source: string }): ReactNode {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  const seen = new Map<string, number>();
  const idFor = (t: string) => { const base = slugify(t) || "section"; const c = seen.get(base) ?? 0; seen.set(base, c + 1); return c ? `${base}-${c}` : base; };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.trim().startsWith("```")) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} className="my-6 overflow-x-auto rounded-2xl bg-slate-950 p-5 text-sm leading-relaxed text-slate-100"><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (h) {
      const level = h[1].length === 3 ? 3 : 2;
      const plain = h[2].replace(/[*_`]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
      const id = idFor(plain);
      blocks.push(level === 2
        ? <h2 key={k++} id={id} className="mt-12 scroll-mt-24 font-display text-2xl font-semibold text-stone-900 sm:text-3xl">{inline(h[2], `h${k}`)}</h2>
        : <h3 key={k++} id={id} className="mt-8 scroll-mt-24 font-display text-xl font-semibold text-stone-900">{inline(h[2], `h${k}`)}</h3>);
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={k++} className="my-10 border-stone-200" />); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={k++} className="my-6 border-l-4 border-blue-500 bg-blue-50/50 py-3 pl-5 pr-4 italic text-stone-700">{inline(buf.join(" "), `q${k}`)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) items.push(lines[i++].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={k++} className={`my-5 space-y-2 pl-6 text-stone-700 ${ordered ? "list-decimal" : "list-disc"} marker:text-blue-500`}>{items.map((t, j) => <li key={j}>{inline(t, `l${k}-${j}`)}</li>)}</Tag>);
      continue;
    }
    // paragraph: gather until blank line / block start
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|---+\s*$|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    const text = buf.join(" ").trim();
    // a paragraph that is only an image renders as a figure
    blocks.push(<p key={k++} className="my-5 leading-relaxed text-stone-700">{inline(text, `p${k}`)}</p>);
  }
  return <>{blocks}</>;
}
