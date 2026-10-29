"use client";
import { useCallback, useEffect, useState } from "react";
import type { Branding } from "@/lib/types";
import { form } from "@/lib/ml/api";
import { BTN, CARD, Dropzone, ErrorBox, GO, H3, INPUT, MlShell, PreviewFeatures, StatusChip, useMl } from "./common";

interface Doc { id: string; name: string; source: string; characters: number; passages: number; terms: number; terms_with_vectors: number }
interface Hit { doc_id: string; document: string; passage: number; text: string; score: number; semantic_similarity: number; bm25: number; matching_words: string[] }
interface Q { results: Hit[]; mode: string; alpha: number | null; query_terms: string[]; query_terms_with_vectors: string[]; notes?: string[]; passages_searched?: number }
const sid = () => { try { const k = "neoforge-ml-session"; let v = localStorage.getItem(k); if (!v || !/^[0-9a-f]{32}$/.test(v)) { v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem(k, v); } return v; } catch { return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); } };
const MODE_TEXT: Record<string, string> = { semantic: "Semantic: query and passages are each turned into one vector (the IDF-weighted average of 300-dimensional pre-trained word vectors) and ranked by cosine similarity. Words with similar meanings score alike, but word order and negation are not understood.", keyword: "Keyword: BM25 ranking over the exact words. It finds only passages that share words with the query.", hybrid: "Hybrid: a weighted sum of the normalised semantic and BM25 scores." };

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const rx = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  return <>{text.split(rx).map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-yellow-400/30 px-0.5 text-yellow-100">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export default function SearchApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service, samples } = useMl(serviceUrl, "text");
  const [session] = useState(() => (typeof window === "undefined" ? "0".repeat(32) : sid()));
  const [docs, setDocs] = useState<Doc[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [q, setQ] = useState(""); const [mode, setMode] = useState("hybrid"); const [alpha, setAlpha] = useState(0.5);
  const [res, setRes] = useState<Q | null>(null); const [title, setTitle] = useState(""); const [text, setText] = useState("");
  const refresh = useCallback(async () => { if (api) setDocs((await api.get<{ documents: Doc[] }>(`/api/search/documents?session=${session}`)).documents); }, [api, session]);
  useEffect(() => { if (service === "online") refresh().catch((e) => setError(e instanceof Error ? e.message : "Could not load the index.")); }, [service, refresh]);
  const guard = async (fn: () => Promise<unknown>) => { setError(""); setBusy(true); try { await fn(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); } };
  const search = () => guard(async () => { if (!api) return; setRes(await api.post<Q>("/api/search/query", form({ session, query: q, mode, k: 6, alpha }))); });
  return (
    <MlShell branding={branding} title="Semantic Document Search & AI Embeddings" project={`${docs.length} document(s) in your index`} service={service}
      notice="Searches a small index you build from the documents below. Semantic mode ranks by pre-trained word-vector (embedding) similarity; keyword mode is plain BM25; hybrid blends them. Each result says which scores it comes from. Your index is held in server memory for 30 minutes and is not shared with other visitors."
      footer="Working: add text, PDF (with a text layer) or sample documents, semantic / keyword / hybrid search with passages and sources, remove documents. Not implemented: answer generation (RAG), vector databases, permissions, cloud sync (previews below).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className={H3}>1 · Documents <StatusChip s="working" /></h2>
          <Dropzone label="Upload a TXT, Markdown or text-layer PDF" accept=".txt,.md,.pdf,text/plain,application/pdf" disabled={service !== "online" || busy} onFile={(f) => guard(async () => { await api!.post("/api/search/documents", form({ session, file: f })); })} />
          <details className="mt-3 text-xs text-slate-300"><summary className="cursor-pointer">Or paste text</summary>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" className={`${INPUT} mt-2 w-full`} /><textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste text…" aria-label="Text" className={`${INPUT} mt-2 w-full`} data-testid="paste" />
            <button className={`${BTN} mt-2`} disabled={busy || service !== "online"} onClick={() => guard(async () => { await api!.post("/api/search/documents", form({ session, text, title })); setText(""); setTitle(""); })} data-testid="add-text">Add pasted text</button></details>
          <p className="mt-3 text-xs text-slate-400">Sample collection (this project&apos;s own documentation):</p>
          <div className="mt-1 flex flex-wrap gap-1">{samples.map((s) => <button key={s.id} className={BTN} disabled={busy || service !== "online" || docs.some((d) => d.name === s.title)} onClick={() => guard(async () => { await api!.post("/api/search/documents", form({ session, sample_id: s.id })); })} data-testid={`sample-${s.id}`} title={s.provenance}>{s.title}</button>)}</div>
          <ul className="mt-3 space-y-1" data-testid="docs">{docs.map((d) => <li key={d.id} className="flex items-start justify-between gap-2 rounded border border-slate-800 p-2 text-xs"><span><strong className="text-slate-100">{d.name}</strong><br />{d.passages} passages · {d.terms_with_vectors}/{d.terms} terms have vectors · {d.source}</span><button className={BTN} onClick={() => guard(async () => { await api!.del(`/api/search/documents/${d.id}?session=${session}`); setRes(null); })} data-testid="remove">Remove</button></li>)}{docs.length === 0 && <li className="text-xs text-slate-400" data-testid="no-docs">The index is empty. Add a document to search.</li>}</ul>
          {docs.length > 0 && <button className={`${BTN} mt-2`} onClick={() => guard(async () => { await api!.post("/api/search/reset", form({ session })); setRes(null); })} data-testid="reset">Clear index</button>}
        </section>
        <section className={CARD} data-testid="result">
          <h2 className={H3}>2 · Search</h2>
          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask in your own words, e.g. how are falls detected?" aria-label="Search query" className={`${INPUT} min-w-0 flex-1`} data-testid="query" maxLength={500} />
            <button className={GO} disabled={busy || !q.trim() || docs.length === 0 || service !== "online"} type="submit" data-testid="search">Search</button>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
            {(["semantic", "keyword", "hybrid"] as const).map((m) => <label key={m} className="flex items-center gap-1"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} data-testid={`mode-${m}`} />{m}</label>)}
            {mode === "hybrid" && <label className="flex items-center gap-2">semantic weight {alpha.toFixed(2)}<input type="range" min={0} max={1} step={0.05} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} aria-label="Semantic weight" /></label>}
          </div>
          <p className="mt-2 text-xs text-slate-400" data-testid="mode-text">{MODE_TEXT[mode]}</p>
          {busy && <p className="mt-3 text-sm text-slate-300" data-testid="loading">Working…</p>}
          {!res && !busy && <p className="mt-4 text-sm text-slate-400" data-testid="empty">{docs.length ? "Type a question and press Search." : "Add documents first. Nothing is ranked until there is something to search."}</p>}
          {res && !busy && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-400" data-testid="meta">{res.passages_searched ?? 0} passages searched in {res.mode} mode. Query words with a word vector: {res.query_terms_with_vectors.join(", ") || "none"}{res.query_terms.length !== res.query_terms_with_vectors.length ? ` (no vector for: ${res.query_terms.filter((t) => !res.query_terms_with_vectors.includes(t)).join(", ")})` : ""}.</p>
              {res.notes?.map((n) => <p key={n} className="text-xs text-amber-300">{n}</p>)}
              {res.results.length === 0 && <p className="text-sm text-slate-200" data-testid="no-results">No passages matched.</p>}
              <ol className="space-y-3" data-testid="results">{res.results.map((h, i) => (
                <li key={`${h.doc_id}-${h.passage}`} className="rounded-md border border-slate-800 p-3" data-testid="hit">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-white">{i + 1}. {h.document}</span><span className="text-slate-400">passage {h.passage}</span>
                    <span className="ml-auto text-slate-400">score {h.score.toFixed(3)} · semantic {h.semantic_similarity.toFixed(3)} · BM25 {h.bm25.toFixed(2)}</span></div>
                  <p className="mt-2 text-sm text-slate-200"><Highlight text={h.text} words={h.matching_words} /></p>
                  <p className="mt-1 text-[11px] text-slate-500">{h.matching_words.length ? `Shared words: ${h.matching_words.join(", ")}` : "No words in common with the query: matched by meaning."}</p>
                </li>))}</ol>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Retrieval-augmented generation", status: "external", note: "it needs a language-model provider; none is configured and no answers are generated." },
        { name: "External vector database integrations", status: "external", note: "the index lives in server memory only." },
        { name: "Team document permissions", status: "soon", note: "there are no accounts or access controls." },
        { name: "Cloud document synchronisation", status: "external", note: "no cloud storage is connected." },
        { name: "Enterprise knowledge assistant", status: "preview", note: "this is a retrieval demo, not an assistant." },
      ]} />
    </MlShell>
  );
}
