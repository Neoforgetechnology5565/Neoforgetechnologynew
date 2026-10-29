"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { serverUrl, subscribeSync, syncStatus, workspaceId, api } from "@/lib/biz/sync";
import { downloadCsv, num } from "@/lib/biz/util";
import { Badge, Btn, Empty, HBars, Notice, Panel, SelectIn, TextIn, useToast } from "./kit";

interface Col { name: string; type: "text" | "number" | "date" }
interface Preview { columns: Col[]; preview: Record<string, unknown>[]; rows_in_file: number; valid_rows: number; invalid_rows: number; duplicates_removed: number; errors: { line: number; message: string }[]; committed: boolean; dataset_id?: string }
interface Dataset { id: string; name: string; columns: Col[]; rows: number; importedAt: string }
interface Result { rows_matched: number; rows_total: number; groups: { group: string; value: number | null; rows: number }[]; total: number | null; note: string }

const RECORDS = ["crm.opps", "crm.leads", "fin.invoices", "fin.expenses", "hrm.employees", "inv.products", "desk.tickets", "proj.tasks", "proj.time"];

/** Import a CSV (preview first, then commit) and run real server-side grouping and filtering over it or over the demo's own records. */
export default function BiExplore() {
  const sync = useSyncExternalStore(subscribeSync, syncStatus, syncStatus);
  const toast = useToast();
  const ready = sync.mode === "synced" || sync.mode === "saving" || sync.mode === "local"; // "local": the in-browser engine
  const [file, setFile] = useState<File | null>(null); const [name, setName] = useState("Imported data"); const [dedupe, setDedupe] = useState(""); const [skip, setSkip] = useState(false);
  const [prev, setPrev] = useState<Preview | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [sets, setSets] = useState<Dataset[]>([]);
  const [source, setSource] = useState("records:crm.opps"); const [cols, setCols] = useState<Col[]>([]);
  const [groupBy, setGroupBy] = useState(""); const [metric, setMetric] = useState(""); const [agg, setAgg] = useState("sum"); const [dateCol, setDateCol] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [fCol, setFCol] = useState(""); const [fOp, setFOp] = useState("eq"); const [fVal, setFVal] = useState("");
  const [res, setRes] = useState<Result | null>(null); const [qErr, setQErr] = useState("");

  const loadSets = useCallback(async () => { if (ready) try { setSets((await api<{ datasets: Dataset[] }>("/bi/datasets")).datasets); } catch { /* shown on action */ } }, [ready]);
  useEffect(() => { void loadSets(); }, [loadSets]);
  useEffect(() => {
    if (!ready) return;
    if (source.startsWith("dataset:")) setCols(sets.find((d) => d.id === source.slice(8))?.columns ?? []);
    else api<{ items: Record<string, unknown>[] }>(`/${source.slice(8).replace(".", "/")}?limit=1`).then((r) => { const row = r.items[0] ?? {}; setCols(Object.entries(row).filter(([, v]) => !Array.isArray(v) && typeof v !== "object").map(([k, v]) => ({ name: k, type: typeof v === "number" ? "number" : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? "date" : "text" }))); }).catch(() => setCols([]));
    setRes(null); setGroupBy(""); setMetric(""); setDateCol(""); setFCol("");
  }, [source, sets, ready]);

  const send = async (mode: "preview" | "commit") => {
    if (!file) return;
    setBusy(true); setErr("");
    const fd = new FormData(); fd.set("file", file); fd.set("name", name); fd.set("mode", mode); fd.set("dedupe_key", dedupe); fd.set("skip_invalid", String(skip));
    try {
      let r: { ok: boolean; status: number }, body: Record<string, unknown>;
      if (serverUrl()) { const resp = await fetch(`${serverUrl()}/api/biz/${workspaceId()}/bi/import`, { method: "POST", body: fd }); r = resp; body = await resp.json().catch(() => ({})); }
      else { const { localBiImport, LocalError } = await import("@/lib/biz/local-engine"); try { body = await localBiImport(fd); r = { ok: true, status: 200 }; } catch (e) { if (!(e instanceof LocalError)) throw e; body = { errors: e.errors, detail: e.message }; r = { ok: false, status: e.status }; } }
      if (!r.ok) { setErr(Array.isArray(body.errors) && (body.errors as string[]).length ? (body.errors as string[]).join(" · ") : typeof body.detail === "string" ? body.detail : `Import failed (${r.status})`); if (mode === "preview") setPrev(null); }
      else { setPrev(body as unknown as Preview); if (mode === "commit") { toast(`Imported ${body.valid_rows} rows as “${name}”`); setSource(`dataset:${body.dataset_id}`); await loadSets(); } }
    } catch { setErr("The business API could not be reached."); } finally { setBusy(false); }
  };
  const run = async () => {
    setQErr(""); const p = new URLSearchParams({ source, agg }); if (groupBy) p.set("group_by", groupBy); if (metric) p.set("metric", metric); if (dateCol) { p.set("date_col", dateCol); if (from) p.set("date_from", from); if (to) p.set("date_to", to); } if (fCol && fVal) p.set(`filter.${fCol}`, `${fOp}:${fVal}`);
    try { setRes(await api<Result>(`/bi/query?${p}`)); } catch (e) { setRes(null); setQErr((e as Error).message); }
  };
  const nums = cols.filter((c) => c.type === "number"), dates = cols.filter((c) => c.type === "date");

  if (!ready) return <Panel><p className="text-[15px]" data-testid="bi-needs-server"><Badge tone="amber">Requires backend</Badge> CSV import and server-side queries need the demo server{sync.mode === "local" ? " (BIZ_API_URL is not configured for this site)" : ""}. The other analysis tabs work without it.</p></Panel>;
  return (
    <div className="space-y-4" data-testid="bi-explore">
      <Panel title="1 · Import a CSV file">
        <p className="mb-3 text-sm text-slate-600">Upload a .csv file (first row = column names). You see a preview with any invalid rows before anything is stored. Binary files and files over the size limit are refused.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-600">CSV file</span><input type="file" accept=".csv,text/csv" data-testid="csv-file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPrev(null); setErr(""); }} className="block w-full text-sm" /></label>
          <TextIn label="Dataset name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextIn label="De-duplicate on columns (optional)" value={dedupe} onChange={(e) => setDedupe(e.target.value)} placeholder="e.g. date,region" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><Btn onClick={() => send("preview")} disabled={!file || busy} testid="csv-preview">Preview</Btn>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />Skip invalid rows when importing</label>
          <Btn kind="primary" onClick={() => send("commit")} disabled={!file || busy || !prev} testid="csv-commit">Import</Btn></div>
        {err && <div className="mt-3" data-testid="csv-error"><Notice tone="red">{err}</Notice></div>}
        {prev && <div className="mt-3 text-sm" data-testid="csv-preview-result">
          <p><b>{prev.valid_rows}</b> valid rows of {prev.rows_in_file} in the file{prev.invalid_rows ? <> · <span className="text-red-700"><b>{prev.invalid_rows}</b> invalid</span></> : null}{prev.duplicates_removed ? ` · ${prev.duplicates_removed} duplicates removed` : ""}{prev.committed ? " · stored" : " · not stored yet"}</p>
          <p className="mt-1 text-slate-600">Columns: {prev.columns.map((c) => `${c.name} (${c.type})`).join(", ")}</p>
          {prev.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-red-700">{prev.errors.slice(0, 8).map((e) => <li key={e.line + e.message}>Line {e.line}: {e.message}</li>)}</ul>}
          <div className="mt-2 overflow-x-auto"><table className="min-w-full text-xs"><thead><tr>{prev.columns.map((c) => <th key={c.name} className="border-b px-2 py-1 text-left">{c.name}</th>)}</tr></thead><tbody>{prev.preview.slice(0, 5).map((r, i) => <tr key={i}>{prev.columns.map((c) => <td key={c.name} className="border-b px-2 py-1">{String(r[c.name] ?? "")}</td>)}</tr>)}</tbody></table></div>
        </div>}
      </Panel>
      <Panel title="2 · Explore">
        <div className="grid gap-3 sm:grid-cols-4">
          <SelectIn label="Data source" value={source} onChange={(e) => setSource(e.target.value)} options={[...RECORDS.map((r) => ({ value: `records:${r}`, label: `Demo records: ${r}` })), ...sets.map((d) => ({ value: `dataset:${d.id}`, label: `Imported: ${d.name} (${d.rows} rows)` }))]} data-testid="bi-source" />
          <SelectIn label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} options={[{ value: "", label: "(no grouping)" }, ...cols.map((c) => ({ value: c.name, label: c.name }))]} data-testid="bi-group" />
          <SelectIn label="Measure" value={agg} onChange={(e) => setAgg(e.target.value)} options={["sum", "avg", "count", "min", "max"]} data-testid="bi-agg" />
          <SelectIn label="Numeric column" value={metric} onChange={(e) => setMetric(e.target.value)} options={[{ value: "", label: "(none)" }, ...nums.map((c) => ({ value: c.name, label: c.name }))]} data-testid="bi-metric" />
          <SelectIn label="Date column" value={dateCol} onChange={(e) => setDateCol(e.target.value)} options={[{ value: "", label: "(none)" }, ...dates.map((c) => ({ value: c.name, label: c.name }))]} data-testid="bi-datecol" />
          <TextIn label="From (YYYY-MM-DD)" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!dateCol} data-testid="bi-from" />
          <TextIn label="To (YYYY-MM-DD)" value={to} onChange={(e) => setTo(e.target.value)} disabled={!dateCol} data-testid="bi-to" />
          <div />
          <SelectIn label="Filter column" value={fCol} onChange={(e) => setFCol(e.target.value)} options={[{ value: "", label: "(none)" }, ...cols.map((c) => ({ value: c.name, label: c.name }))]} data-testid="bi-fcol" />
          <SelectIn label="Operator" value={fOp} onChange={(e) => setFOp(e.target.value)} options={["eq", "ne", "gt", "gte", "lt", "lte"]} />
          <TextIn label="Value" value={fVal} onChange={(e) => setFVal(e.target.value)} data-testid="bi-fval" />
          <div className="flex items-end"><Btn kind="primary" onClick={run} testid="bi-run">Run query</Btn></div>
        </div>
        {qErr && <div className="mt-3" data-testid="bi-error"><Notice tone="red">{qErr}</Notice></div>}
        {res ? <div className="mt-4" data-testid="bi-result">
          <p className="text-sm text-slate-600">{res.rows_matched} of {res.rows_total} rows matched · total <b data-testid="bi-total">{res.total === null ? "n/a" : num(res.total)}</b></p>
          {res.groups.length > 1 ? <div className="mt-2 max-w-2xl"><HBars items={res.groups.slice(0, 15).map((g) => ({ label: g.group, value: g.value ?? 0, sub: `${g.rows} rows` }))} fmt={(n) => num(n)} /></div> : null}
          <table className="mt-3 min-w-[320px] text-sm" data-testid="bi-table"><thead><tr><th className="border-b px-2 py-1 text-left">Group</th><th className="border-b px-2 py-1 text-right">Value</th><th className="border-b px-2 py-1 text-right">Rows</th></tr></thead><tbody>{res.groups.map((g) => <tr key={g.group}><td className="border-b px-2 py-1">{g.group}</td><td className="border-b px-2 py-1 text-right">{g.value === null ? "n/a" : num(g.value)}</td><td className="border-b px-2 py-1 text-right">{g.rows}</td></tr>)}</tbody></table>
          <Btn className="mt-3" small onClick={() => downloadCsv("query-result.csv", [["group", "value", "rows"], ...res.groups.map((g) => [g.group, g.value ?? "", g.rows])])}>Export CSV</Btn>
        </div> : <div className="mt-4"><Empty>Choose a source and run a query. Results are calculated by the server from the stored records.</Empty></div>}
      </Panel>
    </div>
  );
}
