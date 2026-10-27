"use client";
import { useMemo, useState } from "react";
import DemoShell from "./DemoShell";
import { MAT, MODS, unitOptions, type Mod, type Out, type Sel } from "./calcmods";
import { BTN, FIELD, H3, LBL, PRIMARY, download, stamp, toCsv } from "./ui";
import { OCCUPANCY } from "@/lib/demo-calc";
import type { Branding } from "@/lib/types";

type St = { vals: Record<string, string>; sel: Sel };
const init = (m: Mod): St => ({ vals: Object.fromEntries(m.inputs.map((i) => [i.k, i.def])), sel: Object.fromEntries(m.selects.map((s) => [s.k, s.def])) });
const initAll = () => Object.fromEntries(MODS.map((m) => [m.id, init(m)])) as Record<string, St>;

export default function CalcWorkbench({ branding }: { branding: Branding }) {
  const [modId, setModId] = useState("beam");
  const [state, setState] = useState<Record<string, St>>(initAll);
  const [tab, setTab] = useState<"results" | "steps" | "formulas" | "history">("results");
  const [hist, setHist] = useState<{ t: string; module: string; summary: string; inputs: string; results: string }[]>([]);
  const mod = MODS.find((m) => m.id === modId) as Mod;
  const st = state[modId];
  const sel = st.sel;
  const visible = mod.inputs.filter((i) => !i.show || i.show(sel));

  const { errors, nums, fieldErr } = useMemo(() => {
    const errors: string[] = [], fieldErr: Record<string, string> = {}, nums: Record<string, number> = {};
    for (const i of visible) {
      const raw = (st.vals[i.k] ?? "").trim();
      if (raw === "") { fieldErr[i.k] = "Required"; errors.push(`${i.label} is required.`); continue; }
      const v = Number(raw);
      if (!Number.isFinite(v)) { fieldErr[i.k] = "Enter a number"; errors.push(`${i.label} must be a number.`); continue; }
      if (v < i.min || v > i.max) { fieldErr[i.k] = `Between ${i.min} and ${i.max}`; errors.push(`${i.label} must be between ${i.min} and ${i.max}${i.unit ? " " + i.unit : ""}.`); continue; }
      nums[i.k] = v;
    }
    if (!errors.length && mod.validate) errors.push(...mod.validate(nums, sel));
    return { errors, nums, fieldErr };
  }, [visible, st.vals, sel, mod]);
  const out: Out | null = useMemo(() => { if (errors.length) return null; try { return mod.run(nums, sel); } catch { return null; } }, [errors, nums, sel, mod]);

  const setVal = (k: string, v: string) => setState((s) => ({ ...s, [modId]: { ...s[modId], vals: { ...s[modId].vals, [k]: v } } }));
  const setSel = (k: string, v: string) => setState((s) => {
    const cur = s[modId]; let ns = { ...cur.sel, [k]: v }, vals = cur.vals;
    if (modId === "units" && k === "cat") { const o = unitOptions(v); ns = { cat: v, from: o[0][0], to: (o[1] ?? o[0])[0] }; }
    if (modId === "beam" && k === "mat" && v !== "custom") vals = { ...vals, E: MAT[v].E, fy: MAT[v].fy };
    if (modId === "loads" && k === "occ") vals = { ...vals, q: String(OCCUPANCY[v].q) };
    return { ...s, [modId]: { vals, sel: ns } };
  });
  const preset = (name: string) => setState((s) => { const p = mod.presets[name]; return { ...s, [modId]: { vals: { ...init(mod).vals, ...p.vals }, sel: { ...init(mod).sel, ...(p.sel ?? {}) } } }; });
  const reset = () => setState((s) => ({ ...s, [modId]: init(mod) }));

  const inputsText = visible.map((i) => `${i.label}: ${st.vals[i.k]}${i.unit ? " " + i.unit : ""}`).concat(mod.selects.filter((s) => s.options.length || s.k !== "from").map((s) => `${s.label}: ${(s.options.find((o) => o[0] === sel[s.k]) ?? [sel[s.k], sel[s.k]])[1]}`));
  const resultsText = out ? out.rows.map((r) => `${r[0]}: ${r[1]} ${r[2] ?? ""}`.trim()) : [];
  const sheet = () => [`${mod.name} — calculation sheet (SAMPLE, demonstration only)`, `Generated ${new Date().toISOString()}`, "", "INPUTS", ...inputsText, "", "RESULTS", ...resultsText, out?.status ? `\n${out.status.text}` : "", "", "STEPS", ...(out?.steps.flatMap((s, i) => [`${i + 1}. ${s.t}`, s.f ? `   ${s.f}` : ""]) ?? []), "", "FORMULAS", ...mod.formulas(sel), "", "ASSUMPTIONS", ...mod.assumptions.map((a) => `- ${a}`), "", "LIMITATIONS", ...mod.limits.map((a) => `- ${a}`), "", "This is a portfolio demonstration. It is not certified engineering software and does not replace review by a qualified engineer."].join("\n");
  const save = () => { if (!out) return; setHist((h) => [{ t: stamp(), module: mod.name, summary: `${out.rows[0][0]} ${out.rows[0][1]} ${out.rows[0][2] ?? ""}`, inputs: inputsText.join("; "), results: resultsText.join("; ") }, ...h].slice(0, 50)); setTab("history"); };
  const selOptions = (s: Mod["selects"][number]) => (modId === "units" && s.k !== "cat" ? unitOptions(sel.cat) : s.options);

  return (
    <DemoShell branding={branding} app="Engineering Calculation Workbench" project={`Module: ${mod.name}`} status={errors.length ? `${errors.length} input error${errors.length > 1 ? "s" : ""}: results unavailable` : "Inputs valid · results current"}
      actions={<><button type="button" onClick={() => download(`${mod.id}-calculation-sample.txt`, sheet())} disabled={!out} className={`${BTN} disabled:opacity-40`}>Download calculation sheet</button><button type="button" onClick={reset} className={BTN}>Reset module</button></>}>
      <div className="grid grid-cols-1 lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside aria-label="Module and inputs" className="order-2 border-t border-slate-800 bg-slate-900/60 lg:order-1 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <nav aria-label="Calculation modules" className="flex gap-1 overflow-x-auto border-b border-slate-800 p-2 lg:flex-wrap">{MODS.map((m) => <button key={m.id} type="button" onClick={() => { setModId(m.id); setTab("results"); }} aria-pressed={m.id === modId} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${m.id === modId ? "bg-blue-600/25 text-blue-200" : "text-slate-300 hover:bg-slate-800"}`}>{m.name}</button>)}</nav>
          <div className="space-y-4 p-4">
            <p className="text-xs leading-relaxed text-slate-400">{mod.blurb}</p>
            <div><label className={LBL} htmlFor="preset">Example inputs</label><select id="preset" value="" onChange={(e) => e.target.value && preset(e.target.value)} className={FIELD}><option value="">Load an example…</option>{Object.keys(mod.presets).map((p) => <option key={p}>{p}</option>)}</select></div>
            {mod.selects.map((s) => <div key={s.k}><label className={LBL} htmlFor={`s-${s.k}`}>{s.label}</label><select id={`s-${s.k}`} value={sel[s.k]} onChange={(e) => setSel(s.k, e.target.value)} className={FIELD}>{selOptions(s).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>)}
            {visible.map((i) => (
              <div key={i.k}><label className={LBL} htmlFor={`i-${i.k}`}>{i.label}{i.unit ? ` (${i.unit})` : ""}</label>
                <input id={`i-${i.k}`} inputMode="decimal" value={st.vals[i.k] ?? ""} onChange={(e) => setVal(i.k, e.target.value)} aria-invalid={!!fieldErr[i.k]} aria-describedby={fieldErr[i.k] ? `e-${i.k}` : undefined} className={`${FIELD} ${fieldErr[i.k] ? "border-red-500" : ""}`} />
                {fieldErr[i.k] ? <p id={`e-${i.k}`} className="mt-0.5 text-[11px] text-red-300">{fieldErr[i.k]}</p> : i.help ? <p className="mt-0.5 text-[10px] text-slate-500">{i.help}</p> : null}
              </div>
            ))}
            {errors.length > 0 && <ul role="alert" className="space-y-1.5">{errors.map((e, i) => <li key={i} className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-200">✗ {e}</li>)}</ul>}
          </div>
        </aside>

        <div className="order-1 min-w-0 space-y-3 p-3 sm:p-4 lg:order-2">
          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-[#0a0f0c]">
            {out ? out.diag : <div className="flex h-72 items-center justify-center p-6 text-center text-sm text-amber-300">Diagram and results are unavailable until the inputs are corrected.</div>}
          </div>
          {out?.status && <p role="status" className={`rounded px-3 py-2 text-xs ${out.status.ok ? "bg-blue-500/10 text-blue-200" : "bg-amber-500/10 text-amber-200"}`}>{out.status.ok ? "✓ " : "⚠ "}{out.status.text}</p>}
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="flex flex-wrap border-b border-slate-800" role="tablist">{([["results", "Results"], ["steps", "Step-by-step"], ["formulas", "Formulas and assumptions"], ["history", `History (${hist.length})`]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm ${tab === k ? "border-b-2 border-blue-500 font-semibold text-blue-300" : "text-slate-400 hover:text-white"}`}>{l}</button>)}</div>
            <div className="p-4 text-xs">
              {tab === "results" && (out ? (
                <div><table className="w-full"><tbody>{out.rows.map((r) => <tr key={r[0]} className="border-b border-slate-800 last:border-0"><td className="py-1.5 text-slate-400">{r[0]}</td><td className="py-1.5 text-right font-mono text-sm font-semibold text-white">{r[1]}</td><td className="w-24 py-1.5 pl-2 text-slate-500">{r[2]}</td></tr>)}</tbody></table>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={save} className={PRIMARY}>Save to history</button><button type="button" onClick={() => download(`${mod.id}-results-sample.csv`, toCsv([["Quantity", "Value", "Unit"], ...out.rows.map((r) => [r[0], r[1], r[2] ?? ""])]), "text/csv")} className={BTN}>Results (.csv)</button></div></div>
              ) : <p className="text-amber-300">Results are unavailable because the inputs are invalid. Correct them to continue.</p>)}
              {tab === "steps" && (out ? <ol className="space-y-3">{out.steps.map((s, i) => <li key={i} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">{i + 1}</span><div><p className="text-slate-200">{s.t}</p>{s.f && <p className="mt-1 rounded bg-slate-950 px-3 py-2 font-mono text-[11px] text-blue-200">{s.f}</p>}</div></li>)}</ol> : <p className="text-amber-300">No calculation steps: the inputs are invalid.</p>)}
              {tab === "formulas" && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div><h3 className={H3}>Formulas</h3><ul className="mt-2 space-y-1.5 font-mono text-[11px] text-blue-200">{mod.formulas(sel).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div><h3 className={H3}>Assumptions</h3><ul className="mt-2 list-disc space-y-1.5 pl-4 text-slate-300">{mod.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div><h3 className={H3}>Limitations</h3><ul className="mt-2 list-disc space-y-1.5 pl-4 text-amber-200">{mod.limits.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
              )}
              {tab === "history" && (hist.length ? <div><ul className="space-y-1.5">{hist.map((h, i) => <li key={i} className="rounded border border-slate-800 bg-slate-950 px-3 py-2"><span className="font-mono text-slate-500">{h.t}</span> <b className="text-white">{h.module}</b> · {h.summary}<br /><span className="text-slate-500">{h.inputs}</span></li>)}</ul><button type="button" className={`${BTN} mt-3`} onClick={() => download("calculation-history-sample.csv", toCsv([["Time", "Module", "Inputs", "Results"], ...hist.map((h) => [h.t, h.module, h.inputs, h.results])]), "text/csv")}>History (.csv)</button></div> : <p className="text-slate-500">No saved calculations yet. Use “Save to history” on the Results tab.</p>)}
            </div>
          </div>
          <p className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] leading-snug text-slate-400">Portfolio demonstration with transparent textbook formulas for the stated assumptions. It is not certified engineering software, includes no code checks or safety factors, and does not replace review by a qualified engineer. The formulas are verified by automated tests against independent hand-calculated cases.</p>
        </div>
      </div>
    </DemoShell>
  );
}

