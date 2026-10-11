import "server-only";
import { DIVISIONS } from "./divisions";
import { parseVideo } from "./video";

export interface PdfImport {
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  division: string;
  pages: number;
  words: number;
  headings: number;
  warnings: string[];
  seoTitle: string;
  seoDescription: string;
  coverAlt: string;
  videoLinks: string[];
  /** URL of an image taken from the PDF to use as the cover, if it had a big enough one */
  coverUrl: string;
  images: number;
}

export interface ImportOptions {
  /** Stores an image extracted from the PDF and returns its public URL. When omitted, images are not extracted. */
  upload?: (png: Buffer, name: string) => Promise<string>;
}

interface Line {
  text: string;
  size: number;
  y: number;
  page: number;
}

const TAG_VOCAB = [
  "Revit", "AutoCAD", "BIM", "CAD", "ERP", "CRM", "HRM", "Computer Vision", "AI", "Machine Learning",
  "Automation", "Python", "Dynamo", "Plugin", "API", "Cloud", "Dashboard", "Payroll", "Inventory",
  "Detection", "OCR", "Analytics", "Integration", "Workflow",
];

const DIVISION_KEYWORDS: Record<string, string[]> = {
  "computer-vision": ["computer vision", "machine learning", "neural", "detection", "ocr", "model", "ai "],
  "crm-hrm-erp": ["erp", "crm", "hrm", "payroll", "inventory", "dashboard", "invoice"],
  "cad-bim": ["revit", "autocad", "bim", "cad", "plugin", "dynamo", "drawing", "model"],
};

const clean = (s: string) => s.replace(/\u0000/g, "").replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();

export async function parsePdf(bytes: Uint8Array, filename = "", opts: ImportOptions = {}): Promise<PdfImport> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const warnings: string[] = [];
  const lines: Line[] = [];
  const pageCount = pdf.numPages;
  const maxPages = Math.min(pageCount, 60);
  if (pageCount > maxPages) warnings.push(`Only the first ${maxPages} pages were read.`);

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows: { y: number; size: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of tc.items as { str?: string; transform: number[]; height?: number }[]) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const y = it.transform[5];
      const size = Math.abs(it.transform[3]) || it.height || 0;
      const row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, size * 0.3));
      if (row) {
        row.parts.push({ x: it.transform[4], s: it.str });
        row.size = Math.max(row.size, size);
      } else rows.push({ y, size, parts: [{ x: it.transform[4], s: it.str }] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      const text = clean(r.parts.map((x) => x.s).join(" "));
      if (text) lines.push({ text, size: Math.round(r.size * 2) / 2, y: r.y, page: p });
    }
  }

  const meta = await pdf.getMetadata().catch(() => null);
  const totalChars = lines.reduce((n, l) => n + l.text.length, 0);
  if (totalChars < 80) {
    warnings.push("No readable text was found. This looks like a scanned PDF (images only) — scanned text can't be read yet, please fill the article manually.");
    return { title: filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim(), excerpt: "", content: "", tags: [], division: "", pages: pageCount, words: 0, headings: 0, warnings, seoTitle: "", seoDescription: "", coverAlt: "", videoLinks: [], coverUrl: "", images: 0 };
  }

  // Drop repeated headers/footers and page numbers.
  const freq = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = l.text.replace(/\d+/g, "#").toLowerCase();
    (freq.get(k) ?? freq.set(k, new Set()).get(k)!).add(l.page);
  }
  const body = lines.filter((l) => {
    const k = l.text.replace(/\d+/g, "#").toLowerCase();
    if (/^(page\s*)?#(\s*(of|\/)\s*#)?$/.test(k)) return false;
    if (maxPages >= 2 && l.text.length < 90 && (freq.get(k)?.size ?? 0) >= Math.max(2, Math.ceil(maxPages * 0.6))) return false;
    return true;
  });

  // Body font size = most common size weighted by characters.
  const weight = new Map<number, number>();
  for (const l of body) weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  const bodySize = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;

  // Title = largest text on the first page.
  const first = body.filter((l) => l.page === 1);
  const maxSize = Math.max(...first.map((l) => l.size), 0);
  let titleLines: Line[] = [];
  if (maxSize > bodySize * 1.25) titleLines = first.filter((l) => l.size === maxSize).slice(0, 3);
  let title = clean(titleLines.map((l) => l.text).join(" "));
  if (!title) {
    const m = clean(String((meta?.info as { Title?: string } | undefined)?.Title || ""));
    if (m && !/^(about:blank|untitled|microsoft word)/i.test(m)) title = m;
  }
  if (!title && first[0] && first[0].text.length <= 120) {
    title = first[0].text;
    titleLines = [first[0]];
  }
  if (!title) title = filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
  title = title.slice(0, 160);

  const titleSize = titleLines.length && maxSize > bodySize * 1.25 ? maxSize : -1;
  const sizes = [...new Set(body.map((l) => l.size).filter((s) => s > bodySize * 1.12 && s !== titleSize))].sort((a, b) => b - a);
  const out: string[] = [];
  let para = "";
  let headings = 0;
  const outPage: number[] = [];
  let lastPage = 1;
  const flush = () => {
    if (para.trim()) { out.push(para.trim()); outPage.push(lastPage); }
    para = "";
  };
  // Typical gap between consecutive body lines — a clearly bigger gap starts a new paragraph.
  const gaps: number[] = [];
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1], b = body[i];
    if (a.page === b.page && a.size === bodySize && b.size === bodySize && a.y - b.y > 0) gaps.push(a.y - b.y);
  }
  gaps.sort((a, b) => a - b);
  const lineGap = gaps[Math.floor(gaps.length / 2)] || bodySize * 1.3;
  let prev: Line | null = null;
  for (const l of body) {
    if (titleLines.includes(l)) continue;
    const level = sizes.indexOf(l.size);
    if (level >= 0 && l.text.length <= 120) {
      flush();
      out.push(`${level === 0 ? "##" : "###"} ${l.text.replace(/[.:]$/, "")}`);
      outPage.push(l.page);
      headings++;
      prev = l;
      continue;
    }
    lastPage = l.page;
    const bullet = l.text.match(/^[•●▪◦‣\-–*]\s+(.*)$/);
    const num = l.text.match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (bullet || num) {
      flush();
      para = bullet ? `- ${bullet[1]}` : `${num![1]}. ${num![2]}`;
      prev = l;
      continue;
    }
    const gap = prev && prev.page === l.page ? prev.y - l.y : 0;
    const newPara = !prev || prev.page !== l.page ? false : gap > lineGap * 1.35;
    if (newPara || (prev && /^(#)/.test(out[out.length - 1] || "") && !para)) flush();
    if (para && /\w-$/.test(para)) para = para.slice(0, -1) + l.text;
    else para = para ? `${para} ${l.text}` : l.text;
    prev = l;
  }
  flush();

  // Pictures inside the PDF: the first big one becomes the cover, the rest go after the text of the page they sit on.
  let coverUrl = "";
  let imageCount = 0;
  if (opts.upload) {
    try {
      const { extractImages } = await import("unpdf");
      const sharp = (await import("sharp")).default;
      const seen = new Set<string>();
      const inserts: { page: number; md: string }[] = [];
      for (let p = 1; p <= maxPages && imageCount < 8; p++) {
        for (const im of await extractImages(pdf, p).catch(() => [])) {
          if (imageCount >= 8 || seen.has(im.key) || im.width < 200 || im.height < 120) continue;
          seen.add(im.key);
          const png = await sharp(Buffer.from(im.data), { raw: { width: im.width, height: im.height, channels: im.channels } }).resize({ width: 1400, withoutEnlargement: true }).png().toBuffer();
          const url = await opts.upload(png, `pdf-p${p}-${imageCount + 1}.png`);
          imageCount++;
          if (!coverUrl && im.width >= 600) { coverUrl = url; continue; }
          let h = "";
          for (let i = outPage.length - 1; i >= 0; i--) if (outPage[i] <= p && out[i].startsWith("#")) { h = out[i].replace(/^#+\s*/, ""); break; }
          inserts.push({ page: p, md: `![${(h || title).replace(/[\]\n]/g, " ")} — figure](${url})` });
        }
      }
      for (const ins of inserts.reverse()) {
        let at = -1;
        for (let i = 0; i < outPage.length; i++) if (outPage[i] <= ins.page) at = i;
        out.splice(at + 1, 0, ins.md);
        outPage.splice(at + 1, 0, ins.page);
      }
    } catch {
      warnings.push("Some pictures in the PDF couldn't be extracted — add them with the Image button.");
    }
  }

  // Merge consecutive list items into one block.
  const content = out
    .reduce<string[]>((acc, b) => {
      const last = acc[acc.length - 1];
      if (last && /^(- |\d+\. )/.test(b) && /^(- |\d+\. )/.test(last.split("\n").pop()!)) acc[acc.length - 1] = `${last}\n${b}`;
      else acc.push(b);
      return acc;
    }, [])
    .join("\n\n")
    .slice(0, 80000);

  const plain = content.replace(/[#*\-]|\d+\./g, " ");
  const words = plain.split(/\s+/).filter(Boolean).length;
  const firstPara = out.find((b) => !/^(#|- |\d+\. )/.test(b) && b.length >= 60) || "";
  let excerpt = firstPara.slice(0, 300);
  if (excerpt.length > 200) {
    const cut = excerpt.slice(0, 200).lastIndexOf(". ");
    excerpt = cut > 80 ? excerpt.slice(0, cut + 1) : excerpt.slice(0, 197).trimEnd() + "…";
  }

  const lower = ` ${content.toLowerCase()} `;
  const tags = TAG_VOCAB.map((t) => ({ t, n: lower.split(t.toLowerCase()).length - 1 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((x) => x.t);
  const scores = DIVISIONS.map((d) => ({ slug: d.slug as string, n: (DIVISION_KEYWORDS[d.slug] ?? []).reduce((s, k) => s + (lower.split(k).length - 1), 0) }))
    .sort((a, b) => b.n - a.n);
  const division = scores[0] && scores[0].n >= 3 ? scores[0].slug : "";

  const videoLinks = [...new Set(lines.flatMap((l) => l.text.match(/https?:\/\/[^\s)]+/g) ?? []).filter((u) => parseVideo(u)))].slice(0, 6);
  const seoTitle = title.length <= 65 ? title : title.slice(0, 62).trimEnd() + "…";
  const seoDescription = (excerpt.length <= 160 ? excerpt : excerpt.slice(0, 157).trimEnd() + "…");
  if (headings === 0) warnings.push("No headings were detected, so the text came in as plain paragraphs — add headings in the editor.");
  warnings.push("Images, tables and diagrams in the PDF are not converted — add images with the toolbar if needed.");
  return { title, excerpt, content, tags, division, pages: pageCount, words, headings, warnings, seoTitle, seoDescription, coverAlt: `Cover graphic for “${title}”`.slice(0, 200), videoLinks, coverUrl, images: imageCount };
}
