"use client";
import { useMemo, useState } from "react";
import DemoShell from "./DemoShell";
import { CATS, FIRE, TYPES, PREFIX, buildModel, schedule, typeDef, validate, type Cat, type El, type QRow } from "@/lib/demo-revit-data";

type Tool = "model" | "schedule" | "automation" | "log";
const TOOLS: [Tool, string][] = [["model", "Model"], ["schedule", "Quantity schedule"], ["automation", "Automation rules"], ["log", "Activity log"]];
const COLOR: Record<Cat, string> = { Walls: "#94a3b8", Doors: "#f59e0b", Windows: "#38bdf8", Columns: "#e2e8f0", Floors: "#334155" };
const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const field = "w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500";

const RULES = [
  { key: "marks", name: "Number marks", text: "Gives every element without a mark the next number for its category (W-014, D-001 …).",
    code: `foreach (Element e in collector.WhereElementIsNotElementType())\n{\n  Parameter p = e.get_Parameter(BuiltInParameter.ALL_MODEL_MARK);\n  if (string.IsNullOrEmpty(p.AsString()))\n    p.Set(NextMark(e.Category));\n}` },
  { key: "fire", name: "Set fire ratings on doors", text: "Interior doors → 60 min. Entrance door → 30 min. Walls with no rating take their type default.",
    code: `foreach (FamilyInstance d in doors)\n{\n  var rating = d.Host.Name.StartsWith("Exterior") ? "30 min" : "60 min";\n  d.LookupParameter("Fire Rating").Set(rating);\n}` },
  { key: "validate", name: "Validate model", text: "Reads the model and lists elements with no mark or no fire rating. Changes nothing.",
    code: `var issues = new List<string>();\nforeach (Element e in all)\n  if (Missing(e, "Mark") || Missing(e, "Fire Rating"))\n    issues.Add(e.Id.ToString());` },
] as const;

export default function RevitDashboard() {
  const [els, setEls] = useState<El[]>(() => buildModel());
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("model");
  const [level, setLevel] = useState("Level 1");
  const [cats, setCats] = useState<Set<Cat>>(new Set(CATS));
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [log, setLog] = useState<{ t: string; text: string }[]>([]);
  const [rev, setRev] = useState(0);
  const [snap, setSnap] = useState<{ cat: Cat; rows: QRow[]; rev: number; at: string } | null>(null);
  const [schedCat, setSchedCat] = useState<Cat>("Doors");
  const [ruleOut, setRuleOut] = useState<Record<string, string>>({});

  const issues = useMemo(() => validate(els), [els]);
  const issueIds = useMemo(() => new Set(issues.map((i) => i.id)), [issues]);
  const visible = (e: El) => cats.has(e.cat) && (!q || `${e.id} ${e.type} ${e.mark} ${e.cat}`.toLowerCase().includes(q.toLowerCase())) && (!onlyIssues || issueIds.has(e.id));
  const shown = els.filter((e) => e.level === level);
  const selected = els.find((e) => e.id === sel) ?? null;
  const note = (text: string) => setLog((l) => [{ t: stamp(), text }, ...l].slice(0, 200));

  const edit = (id: string, patch: Partial<El>, label: string) => {
    setEls((all) => all.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setRev((r) => r + 1);
    note(`${id}: ${label}`);
  };
  const changeType = (e: El, type: string) => {
    const t = typeDef(e.cat, type);
    edit(e.id, { type, material: t.material, width: t.width ?? e.width, height: t.height ?? e.height, thickness: t.thickness ?? e.thickness, fire: t.fire ?? e.fire }, `type → ${type}`);
  };
  const reset = () => { setEls(buildModel()); setSel(null); setLog([]); setSnap(null); setRuleOut({}); setRev(0); setQ(""); setOnlyIssues(false); setCats(new Set(CATS)); setLevel("Level 1"); };

  const run = (key: string) => {
    let out = "";
    if (key === "marks") {
      const next: Record<string, number> = {};
      for (const e of els) { const m = e.mark.match(/-(\d+)$/); if (m && e.mark.startsWith(PREFIX[e.cat] + "-")) next[e.cat] = Math.max(next[e.cat] ?? 0, +m[1]); }
      let n = 0;
      const upd = els.map((e) => { if (e.mark) return e; n++; next[e.cat] = (next[e.cat] ?? 0) + 1; return { ...e, mark: `${PREFIX[e.cat]}-${String(next[e.cat]).padStart(3, "0")}` }; });
      setEls(upd); out = n ? `${n} elements numbered.` : "Every element already has a mark.";
    } else if (key === "fire") {
      let n = 0;
      const upd = els.map((e) => {
        if (e.cat === "Doors") { const want = e.exterior ? "30 min" : "60 min"; if (e.fire !== want) { n++; return { ...e, fire: want }; } }
        if (e.cat === "Walls" && e.fire === "None") { n++; return { ...e, fire: typeDef("Walls", e.type).fire ?? "30 min" }; }
        return e;
      });
      setEls(upd); out = `${n} elements updated.`;
    } else {
      const v = validate(els);
      out = v.length ? `${v.length} issues found. First: ${v[0].text}.` : "No issues found.";
    }
    setRuleOut((o) => ({ ...o, [key]: out }));
    if (key !== "validate") setRev((r) => r + 1);
    note(`Rule “${RULES.find((r) => r.key === key)!.name}”: ${out}`);
  };

  const generate = () => { setSnap({ cat: schedCat, rows: schedule(els, schedCat), rev, at: stamp() }); note(`Schedule generated: ${schedCat}`); };
  const csv = () => {
    if (!snap) return;
    const lines = [["Type", "Count", "Quantity", "Unit", "Detail"], ...snap.rows.map((r) => [r.type, r.count, r.qty, r.unit, r.detail])].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${snap.cat.toLowerCase()}-schedule-sample.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const toggleCat = (c: Cat) => setCats((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500";
  const total = snap ? snap.rows.reduce((s, r) => s + r.count, 0) : 0;

  return (
    <DemoShell title="Revit BIM Automation Dashboard" subtitle="Sample two-storey office building · Revit API / C# concept" actions={<button type="button" onClick={reset} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-400 hover:text-white">Reset demo data</button>}>
      <div className="grid min-h-[calc(100vh-7.5rem)] grid-cols-1 lg:grid-cols-[13rem_1fr_19rem]">
        {/* Sidebar */}
        <nav aria-label="Tools" className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/60 p-2 lg:block lg:space-y-1 lg:border-b-0 lg:border-r">
          {TOOLS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTool(k)} className={`w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-sm ${tool === k ? "bg-sky-600/20 font-semibold text-sky-300" : "text-slate-300 hover:bg-slate-800"}`}>{label}</button>
          ))}
          <div className="hidden space-y-2 border-t border-slate-800 px-1 pt-4 text-xs lg:block">
            <p className="flex justify-between"><span className="text-slate-400">Elements</span><span className="font-semibold text-white">{els.length}</span></p>
            <p className="flex justify-between"><span className="text-slate-400">Warnings</span><span className={`font-semibold ${issues.length ? "text-amber-400" : "text-emerald-400"}`}>{issues.length}</span></p>
            <p className="flex justify-between"><span className="text-slate-400">Changes</span><span className="font-semibold text-white">{log.filter((l) => !l.text.startsWith("Schedule") && !l.text.includes("Validate")).length}</span></p>
          </div>
        </nav>

        {/* Workspace */}
        <main className="min-w-0 bg-slate-950 p-3 sm:p-4">
          {tool === "model" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-slate-700 p-0.5" role="tablist" aria-label="Level">
                  {["Level 1", "Level 2"].map((l) => <button key={l} type="button" role="tab" aria-selected={level === l} onClick={() => setLevel(l)} className={`rounded px-3 py-1 text-xs font-medium ${level === l ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}>{l}</button>)}
                </div>
                {CATS.map((c) => <button key={c} type="button" aria-pressed={cats.has(c)} onClick={() => toggleCat(c)} className={`rounded-full border px-3 py-1 text-xs ${cats.has(c) ? "border-sky-500 bg-sky-500/10 text-sky-200" : "border-slate-700 text-slate-500"}`}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: COLOR[c] }} />{c}</button>)}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, type, mark…" aria-label="Search elements" className={`${field} w-48`} />
                <label className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Only warnings</label>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                <svg viewBox="-1.5 -2 27 17.5" className="block w-full" role="img" aria-label={`Plan of ${level}`}>
                  <defs><pattern id="g" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#1e293b" strokeWidth="0.03" /></pattern></defs>
                  <rect x="-2" y="-2" width="28" height="18" fill="url(#g)" />
                  {shown.map((e) => {
                    const on = visible(e), s = e.shape, isSel = e.id === sel;
                    const common = { onClick: () => on && setSel(e.id), style: { cursor: on ? "pointer" : "default", opacity: on ? 1 : 0.12, pointerEvents: on ? ("auto" as const) : ("none" as const) } };
                    const warn = issueIds.has(e.id);
                    if (e.cat === "Floors") return <rect key={e.id} x={s.x1} y={s.y1} width={24} height={14} fill={isSel ? "#1e3a5f" : "#0f1b2d"} stroke={isSel ? "#38bdf8" : "none"} strokeWidth="0.1" {...common} />;
                    if (e.cat === "Walls") return <g key={e.id} {...common}><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={isSel ? "#38bdf8" : warn ? "#fbbf24" : COLOR.Walls} strokeWidth={e.thickness} /><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={0.8} /></g>;
                    if (e.cat === "Columns") return <rect key={e.id} x={s.cx! - 0.25} y={s.cy! - 0.25} width={0.5} height={0.5} fill={isSel ? "#38bdf8" : COLOR.Columns} {...common} />;
                    const w = e.width;
                    return (
                      <g key={e.id} transform={`translate(${s.cx} ${s.cy}) rotate(${s.horiz ? 0 : 90})`} {...common}>
                        {e.cat === "Doors" ? <><rect x={-w / 2} y={-0.2} width={w} height={0.4} fill="#0b1220" /><path d={`M${-w / 2} 0 L${-w / 2} ${-w} A${w} ${w} 0 0 1 ${w / 2} 0`} fill="none" stroke={isSel ? "#38bdf8" : warn ? "#fbbf24" : COLOR.Doors} strokeWidth={0.08} /></>
                          : <rect x={-w / 2} y={-0.18} width={w} height={0.36} fill={isSel ? "#38bdf8" : COLOR.Windows} />}
                      </g>
                    );
                  })}
                  <text x="0" y="-1" fontSize="0.6" fill="#64748b">{level} · click any element</text>
                </svg>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>{["Id", "Category", "Type", "Mark", "Fire rating", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {shown.filter(visible).map((e) => (
                      <tr key={e.id} onClick={() => setSel(e.id)} className={`cursor-pointer border-t border-slate-800 ${e.id === sel ? "bg-sky-600/20" : "hover:bg-slate-900"}`}>
                        <td className="px-3 py-1.5 font-mono text-slate-300">{e.id}</td><td className="px-3 py-1.5">{e.cat}</td><td className="px-3 py-1.5 text-slate-300">{e.type}</td>
                        <td className="px-3 py-1.5">{e.mark || <span className="text-amber-400">—</span>}</td><td className="px-3 py-1.5">{e.fire}</td><td className="px-3 py-1.5 text-amber-400">{issueIds.has(e.id) ? "⚠" : ""}</td>
                      </tr>
                    ))}
                    {!shown.filter(visible).length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No elements match the filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tool === "schedule" && (
            <div className="max-w-3xl space-y-4">
              <div><h2 className="text-base font-semibold text-white">Quantity schedule</h2><p className="text-xs text-slate-400">Groups the model by type and totals the quantities. Edit elements or run rules, then generate again.</p></div>
              <div className="flex flex-wrap items-end gap-3">
                <div><label className={lbl} htmlFor="sc">Category</label><select id="sc" value={schedCat} onChange={(e) => setSchedCat(e.target.value as Cat)} className={`${field} w-40`}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
                <button type="button" onClick={generate} className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500">Generate schedule</button>
                {snap && <button type="button" onClick={csv} className="rounded-md border border-slate-600 px-4 py-2 text-xs font-medium hover:border-sky-400">Download CSV</button>}
              </div>
              {snap && (
                <div>
                  {snap.rev !== rev && <p className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">The model has changed since this schedule was generated. Generate it again to update.</p>}
                  <table className="w-full overflow-hidden rounded-lg border border-slate-800 text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400"><tr>{["Type", "Count", "Quantity", "Unit", "Detail"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                    <tbody>{snap.rows.map((r) => <tr key={r.type} className="border-t border-slate-800"><td className="px-3 py-2">{r.type}</td><td className="px-3 py-2">{r.count}</td><td className="px-3 py-2 font-semibold text-white">{r.qty}</td><td className="px-3 py-2 text-slate-400">{r.unit}</td><td className="px-3 py-2 text-slate-400">{r.detail}</td></tr>)}</tbody>
                    <tfoot><tr className="border-t border-slate-700 bg-slate-900"><td className="px-3 py-2 font-semibold">Total — {snap.cat}</td><td className="px-3 py-2 font-semibold">{total}</td><td colSpan={3} className="px-3 py-2 text-slate-400">generated {snap.at}</td></tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {tool === "automation" && (
            <div className="max-w-3xl space-y-4">
              <div><h2 className="text-base font-semibold text-white">Automation rules</h2><p className="text-xs text-slate-400">Each rule runs in the browser on the sample model. The code shown is illustrative Revit API code for the same task. It is not executed here.</p></div>
              {RULES.map((r) => (
                <section key={r.key} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="text-sm font-semibold text-white">{r.name}</h3><p className="mt-1 text-xs text-slate-400">{r.text}</p></div>
                    <button type="button" onClick={() => run(r.key)} className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">Run rule</button>
                  </div>
                  {ruleOut[r.key] && <p className="mt-3 rounded bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">✓ {ruleOut[r.key]}</p>}
                  <details className="mt-3"><summary className="cursor-pointer text-[11px] text-slate-400">Illustrative C# (Revit API)</summary><pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-3 text-[11px] leading-relaxed text-sky-200">{r.code}</pre></details>
                </section>
              ))}
              {issues.length > 0 && (
                <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-semibold text-amber-300">{issues.length} warnings in the model</h3>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-slate-300">{issues.slice(0, 40).map((i, k) => <li key={k}><button type="button" onClick={() => { setSel(i.id); setLevel(els.find((e) => e.id === i.id)!.level); setTool("model"); }} className="text-left hover:text-sky-300">{i.text}</button></li>)}</ul>
                </section>
              )}
            </div>
          )}

          {tool === "log" && (
            <div className="max-w-3xl">
              <h2 className="text-base font-semibold text-white">Activity log</h2>
              <ul className="mt-3 space-y-1 text-xs">{log.map((l, i) => <li key={i} className="flex gap-3 rounded border border-slate-800 bg-slate-900 px-3 py-2"><span className="font-mono text-slate-500">{l.t}</span><span>{l.text}</span></li>)}{!log.length && <li className="text-slate-500">Nothing yet. Edit an element or run a rule.</li>}</ul>
            </div>
          )}
        </main>

        {/* Properties */}
        <aside aria-label="Properties" className="border-t border-slate-800 bg-slate-900/60 p-4 lg:border-l lg:border-t-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Properties</h2>
          {!selected ? <p className="mt-4 text-xs leading-relaxed text-slate-500">Select an element in the plan or the list to inspect and edit its parameters.</p> : (
            <div className="mt-3 space-y-3">
              <div><p className="font-mono text-sm text-white">{selected.id}</p><p className="text-xs text-slate-400">{selected.cat} · {selected.level}{selected.host ? ` · host ${selected.host}` : ""}</p></div>
              <div><label className={lbl} htmlFor="p-type">Type</label><select id="p-type" value={selected.type} onChange={(e) => changeType(selected, e.target.value)} className={field}>{TYPES[selected.cat].map((t) => <option key={t.name}>{t.name}</option>)}</select></div>
              <div><label className={lbl} htmlFor="p-mark">Mark</label><input id="p-mark" key={selected.id + selected.mark} defaultValue={selected.mark} onBlur={(e) => e.target.value !== selected.mark && edit(selected.id, { mark: e.target.value.slice(0, 20) }, `mark → ${e.target.value || "(empty)"}`)} className={field} /></div>
              <div><label className={lbl} htmlFor="p-fire">Fire rating</label><select id="p-fire" value={selected.fire} onChange={(e) => edit(selected.id, { fire: e.target.value }, `fire rating → ${e.target.value}`)} className={field}>{FIRE.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div><label className={lbl} htmlFor="p-com">Comments</label><textarea id="p-com" key={selected.id + selected.comments} defaultValue={selected.comments} rows={2} onBlur={(e) => e.target.value !== selected.comments && edit(selected.id, { comments: e.target.value.slice(0, 200) }, "comments updated")} className={field} /></div>
              {(selected.cat === "Doors" || selected.cat === "Windows") && (
                <div className="grid grid-cols-2 gap-2">
                  {(["width", "height"] as const).map((k) => <div key={k}><label className={lbl} htmlFor={`p-${k}`}>{k} (m)</label><input id={`p-${k}`} type="number" step="0.05" min="0.3" max="4" key={selected.id + k + selected[k]} defaultValue={selected[k]} onBlur={(e) => { const v = Math.min(4, Math.max(0.3, +e.target.value || selected[k])); if (v !== selected[k]) edit(selected.id, { [k]: v }, `${k} → ${v} m`); }} className={field} /></div>)}
                </div>
              )}
              <dl className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Material</dt><dd>{selected.material}</dd></div>
                {selected.cat === "Walls" && <><div className="flex justify-between"><dt className="text-slate-500">Length</dt><dd>{selected.length.toFixed(1)} m</dd></div><div className="flex justify-between"><dt className="text-slate-500">Thickness</dt><dd>{selected.thickness * 1000} mm</dd></div><div className="flex justify-between"><dt className="text-slate-500">Gross area</dt><dd>{(selected.length * selected.height).toFixed(1)} m²</dd></div></>}
                {selected.cat === "Floors" && <div className="flex justify-between"><dt className="text-slate-500">Area</dt><dd>{(selected.length * selected.width).toFixed(0)} m²</dd></div>}
              </dl>
              {issueIds.has(selected.id) && <p className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-300">⚠ {issues.filter((i) => i.id === selected.id).map((i) => i.text.replace(`${selected.cat.slice(0, -1)} ${selected.id} `, "")).join("; ")}</p>}
            </div>
          )}
        </aside>
      </div>
    </DemoShell>
  );
}
