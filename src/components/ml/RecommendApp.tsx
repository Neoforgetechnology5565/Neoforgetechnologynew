"use client";
import { useEffect, useState } from "react";
import type { Branding } from "@/lib/types";
import { csvCell, download } from "@/lib/ml/api";
import { BTN, CARD, ErrorBox, GO, H3, INPUT, MlShell, PreviewFeatures, StatusChip, useMl } from "./common";

interface Item { id: string; name: string; category: string; brand: string; colour: string; material: string; price: number; description: string }
interface Rec extends Item { score: number; image_similarity: number; text_similarity: number; shared_attributes: string[]; shared_terms: string[] }
interface Sim { selected: Item; results: Rec[]; method: string; image_weight: number }

export default function RecommendApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const { api, service } = useMl(serviceUrl);
  const [items, setItems] = useState<Item[]>([]); const [cats, setCats] = useState<string[]>([]); const [total, setTotal] = useState(0); const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [error, setError] = useState("");
  const [sel, setSel] = useState<string | null>(null); const [w, setW] = useState(0.5); const [sim, setSim] = useState<Sim | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    const t = setTimeout(() => { const p = new URLSearchParams({ q, limit: "60" }); if (cat) p.set("category", cat); api.get<{ items: Item[]; categories: string[]; total: number }>(`/api/products?${p}`).then((r) => { setItems(r.items); setCats(r.categories); setTotal(r.total); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load the catalogue.")); }, 150);
    return () => clearTimeout(t);
  }, [api, q, cat]);
  useEffect(() => { if (!api || !sel) return; setBusy(true); api.get<Sim>(`/api/products/${sel}/similar?k=6&image_weight=${w}`).then((r) => { setSim(r); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Could not rank products.")).finally(() => setBusy(false)); }, [api, sel, w]);
  const img = (id: string) => (api ? api.url(`/api/products/${id}/image`) : "");
  const reset = () => { setQ(""); setCat(""); setSel(null); setSim(null); setW(0.5); };
  return (
    <MlShell branding={branding} title="AI Product Recommendation & Similarity Search" project={sel ? `Similar to ${sim?.selected.name ?? sel}` : "Sample catalogue"} service={service}
      notice="Content-based similarity: product images are compared with MobileNetV2 image embeddings and product text with TF-IDF, blended by the weight you choose. There is no user history and no purchase data. The catalogue images are tiny Fashion-MNIST pictures; names, brands, colours, materials and prices are synthetic."
      footer="Working: browse and search the sample catalogue, find similar products, explanations per result, adjustable image/text blend, CSV export. Not implemented: personalisation, collaborative filtering, shop integrations, A/B tests (previews below). Images: Fashion-MNIST (MIT).">
      <ErrorBox msg={error} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_480px]">
        <section className={CARD} aria-label="Catalogue">
          <h2 className={H3}>1 · Catalogue <StatusChip s="working" /></h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, colour, material…" aria-label="Search the catalogue" className={`${INPUT} min-w-[200px] flex-1`} data-testid="search" />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className={INPUT} data-testid="category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
            <button className={BTN} onClick={reset} data-testid="reset">Reset catalogue view</button>
          </div>
          <p className="mt-2 text-xs text-slate-400" data-testid="count">{items.length} of {total} products shown. Click a product to find similar ones.</p>
          {items.length === 0 && service === "online" && <p className="mt-4 text-sm text-slate-300" data-testid="none">No product matches this search.</p>}
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" data-testid="grid">{items.map((p) => (
            <li key={p.id}><button onClick={() => setSel(p.id)} data-testid="product" className={`w-full rounded-md border p-2 text-left text-xs ${p.id === sel ? "border-blue-500 bg-slate-800" : "border-slate-800 hover:border-slate-600"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(p.id)} alt={p.name} className="aspect-square w-full rounded bg-slate-950 object-contain [image-rendering:pixelated]" /><span className="mt-1 block truncate text-slate-100">{p.name}</span><span className="text-slate-400">{p.category} · ${p.price.toFixed(2)}</span></button></li>
          ))}</ul>
        </section>
        <section className={CARD} aria-label="Similar products" data-testid="result">
          <h2 className={H3}>2 · Similar products</h2>
          {!sel && <p className="mt-3 text-sm text-slate-400" data-testid="empty">Select a product. No recommendation is shown until you do.</p>}
          {sim && sel && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-3 rounded-md border border-blue-500/50 p-2 text-xs" data-testid="selected">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(sim.selected.id)} alt={sim.selected.name} className="h-20 w-20 rounded bg-slate-950 object-contain [image-rendering:pixelated]" /><div><p className="font-semibold text-white">{sim.selected.name}</p><p className="text-slate-300">{sim.selected.category} · {sim.selected.brand} · {sim.selected.colour} · {sim.selected.material} · ${sim.selected.price.toFixed(2)}</p><p className="text-slate-400">{sim.selected.description}</p></div></div>
              <label className="flex items-center gap-3 text-xs text-slate-300">Text ◂ blend ▸ Image: {Math.round(sim.image_weight * 100)}% image<input type="range" min={0} max={1} step={0.1} value={w} onChange={(e) => setW(Number(e.target.value))} aria-label="Image weight" data-testid="weight" /></label>
              <p className="text-[11px] text-slate-500">{sim.method}</p>
              {busy && <p className="text-xs text-slate-400" data-testid="loading">Ranking…</p>}
              <ol className="space-y-2" data-testid="recs">{sim.results.map((r, i) => (
                <li key={r.id} className="flex gap-3 rounded-md border border-slate-800 p-2 text-xs" data-testid="rec">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={img(r.id)} alt={r.name} className="h-16 w-16 shrink-0 rounded bg-slate-950 object-contain [image-rendering:pixelated]" />
                  <div className="min-w-0"><p className="font-semibold text-slate-100">{i + 1}. {r.name} <span className="font-normal text-slate-400">· {r.category} · ${r.price.toFixed(2)}</span></p>
                    <p className="text-slate-300">score {r.score.toFixed(3)} = image {r.image_similarity.toFixed(3)} · text {r.text_similarity.toFixed(3)}</p>
                    <p className="text-slate-500">Shared: {r.shared_attributes.length ? r.shared_attributes.join(", ") : "no attributes"}{r.shared_terms.length ? ` · influential words: ${r.shared_terms.join(", ")}` : ""}</p></div></li>))}</ol>
              <button className={GO} data-testid="export" onClick={() => download(`similar-to-${sim.selected.id}.csv`, ["rank,product_id,name,category,brand,colour,material,price,score,image_similarity,text_similarity,shared_attributes", ...sim.results.map((r, i) => [i + 1, r.id, r.name, r.category, r.brand, r.colour, r.material, r.price, r.score.toFixed(4), r.image_similarity.toFixed(4), r.text_similarity.toFixed(4), r.shared_attributes.join("|")].map(csvCell).join(","))].join("\n"))}>Export recommendations (CSV)</button>
            </div>
          )}
        </section>
      </div>
      <PreviewFeatures items={[
        { name: "Personalised recommendations from user history", status: "soon", note: "there is no user or purchase data." },
        { name: "Collaborative filtering", status: "soon", note: "it needs interaction data from many users." },
        { name: "Real e-commerce integrations", status: "external", note: "no shop platform is connected." },
        { name: "A/B testing", status: "preview", note: "no traffic is served or measured." },
        { name: "Production recommendation API", status: "preview", note: "this service is a demonstration, not a production API." },
      ]} />
    </MlShell>
  );
}
