"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoShell from "@/components/demos/DemoShell";
import type { Branding } from "@/lib/types";
import { LidarApiError, lidarApi } from "@/lib/lidar/api";
import { LABELS, LABEL_COLOR, LABEL_NAME, type CloudSummary, type ColorMode, type Health, type Measurement, type PointData, type Sample, type Selector, type VersionSummary, type Vec3, type Wire } from "@/lib/lidar/types";
import LidarViewer, { type ViewerHandle } from "./LidarViewer";

const BTN = "rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 hover:text-white disabled:opacity-40";
const GO = "rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40";
const CARD = "rounded-lg border border-slate-800 bg-slate-900 p-3";
const H3 = "text-[12px] font-semibold uppercase tracking-wider text-slate-400";
const INPUT = "rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100";
const ACCEPT = ".ply,.pcd,.las,.laz,.xyz,.txt,.csv";
const UNITS = [["unknown", "not stated / unknown"], ["metre", "metres"], ["foot", "feet"], ["us-foot", "US survey feet"], ["centimetre", "centimetres"], ["millimetre", "millimetres"]] as const;
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const num = (v: number) => v.toLocaleString("en-US");
const TYPE_LABEL: Record<string, string> = { point_point: "point ↔ point", point_wire: "point ↔ wire curve", wire_wire: "wire ↔ wire", wire_ground: "wire ↔ ground (vertical)", wire_object: "wire ↔ object", point_object: "point ↔ object (nearest point)", point_ground: "point ↔ ground (height)" };

export default function LidarApp({ branding, serviceUrl }: { branding: Branding; serviceUrl: string | null }) {
  const api = useMemo(() => (serviceUrl ? lidarApi(serviceUrl) : null), [serviceUrl]);
  const [service, setService] = useState<"unknown" | "online" | "offline">(serviceUrl ? "unknown" : "offline"); const [health, setHealth] = useState<Health | null>(null); const [samples, setSamples] = useState<Sample[]>([]);
  const [cloud, setCloud] = useState<CloudSummary | null>(null); const [version, setVersion] = useState("v0"); const [data, setData] = useState<PointData | null>(null); const [wires, setWires] = useState<Wire[]>([]); const [meas, setMeas] = useState<Measurement[]>([]);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [colorMode, setColorMode] = useState<ColorMode>("height"); const [pointSize, setPointSize] = useState(2); const [bg, setBg] = useState("#0b1220"); const [layers, setLayers] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true });
  const [bbox, setBbox] = useState(false); const [grid, setGrid] = useState(false); const [tool, setTool] = useState<"orbit" | "pick">("orbit"); const [picks, setPicks] = useState<Vec3[]>([]); const [selWire, setSelWire] = useState<string | null>(null); const [selMeas, setSelMeas] = useState<string | null>(null);
  const [pp, setPp] = useState({ voxel: "", sorK: "16", sorStd: "2", rorR: "", rorN: "4", normalsK: "20", cropOn: false, lo: ["", "", ""], hi: ["", "", ""], doVoxel: true, doSor: false, doRor: false, doNormals: false });
  const [cp, setCp] = useState({ method: "auto", cell: "", tol: "", rad: "" }); const [wp, setWp] = useState<Record<string, string>>({});
  const [mA, setMA] = useState("pick1"); const [mB, setMB] = useState("pick2"); const [objLabel, setObjLabel] = useState("2"); const [objR, setObjR] = useState("8"); const [thrOn, setThrOn] = useState(false); const [thrV, setThrV] = useState("5"); const [thrU, setThrU] = useState("m"); const [mLabel, setMLabel] = useState("");
  const viewer = useRef<ViewerHandle>(null);
  const ver: VersionSummary | undefined = cloud?.versions.find((v) => v.id === version);
  const unit = cloud?.units.label ?? "units"; const curM = meas.find((m) => m.id === selMeas) ?? null;

  useEffect(() => { if (!api) return; api.health().then((h) => { setHealth(h); setService("online"); }).catch(() => setService("offline")); api.samples().then((s) => setSamples(s.samples)).catch(() => undefined); }, [api]);
  useEffect(() => { if (service !== "offline") return; fetch("/lidar/samples/manifest.json").then((r) => r.json()).then((m) => setSamples(m.samples)).catch(() => undefined); }, [service]);

  const load = useCallback(async (c: CloudSummary, v: string) => {
    if (!api) return; setBusy("Loading points…");
    try { const d = await api.points(c.id, v); setData(d); const w = c.versions.find((x) => x.id === v)?.wires ? (await api.wires(c.id, v)).wires : []; setWires(w); setMeas((await api.measurements(c.id)).measurements); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load points."); } finally { setBusy(""); }
  }, [api]);
  const adopt = (c: CloudSummary, v?: string) => { setCloud(c); const vid = v ?? "v0"; setVersion(vid); setPicks([]); setSelWire(null); setSelMeas(null); setWp({}); setPp((p) => ({ ...p, voxel: String(c.defaults.preprocess.voxel), rorR: String(c.defaults.preprocess.ror_radius) })); setCp((p) => ({ ...p, cell: String(c.defaults.classify.cell), tol: String(c.defaults.classify.ground_tolerance), rad: String(c.defaults.classify.feature_radius) })); void load(c, vid); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "The request failed.");
  const refresh = async (v?: string) => { if (!api || !cloud) return; const c = await api.summary(cloud.id); setCloud(c); const vid = v ?? version; setVersion(vid); await load(c, vid); };

  const openFile = async (f: File | undefined) => {
    if (!api || !f) return; setError(""); setInfo(""); setBusy(`Uploading ${f.name}…`);
    if (health && f.size > health.limits.max_file_mb * 1_000_000) { setError(`The file is larger than the ${health.limits.max_file_mb} MB limit.`); setBusy(""); return; }
    try { if (cloud) void api.remove(cloud.id).catch(() => undefined); const c = await api.upload(f); setData(null); setWires([]); adopt(c); } catch (e) { fail(e); setBusy(""); }
  };
  const openSample = async (s: Sample) => { if (!api) return; setError(""); setInfo(""); setBusy(`Loading ${s.title}…`); try { if (cloud) void api.remove(cloud.id).catch(() => undefined); const c = await api.fromSample(s.id); setData(null); setWires([]); adopt(c); } catch (e) { fail(e); setBusy(""); } };
  const setUnits = async (u: string) => { if (!api || !cloud) return; try { const c = await api.setUnits(cloud.id, u); setCloud(c); setWp({}); setPp((p) => ({ ...p, voxel: String(c.defaults.preprocess.voxel), rorR: String(c.defaults.preprocess.ror_radius) })); setCp((p) => ({ ...p, cell: String(c.defaults.classify.cell), tol: String(c.defaults.classify.ground_tolerance), rad: String(c.defaults.classify.feature_radius) })); } catch (e) { fail(e); } }; // picks and measurements are about coordinates and stay as they are

  const runPre = async () => {
    if (!api || !cloud) return; setError(""); const ops: object[] = [];
    if (pp.cropOn) ops.push({ op: "crop", min: pp.lo.map(Number), max: pp.hi.map(Number) });
    if (pp.doVoxel) ops.push({ op: "voxel_downsample", voxel: Number(pp.voxel) });
    if (pp.doSor) ops.push({ op: "statistical_outlier_removal", k: Number(pp.sorK), std_ratio: Number(pp.sorStd) });
    if (pp.doRor) ops.push({ op: "radius_outlier_removal", radius: Number(pp.rorR), min_neighbors: Number(pp.rorN) });
    if (pp.doNormals) ops.push({ op: "estimate_normals", k: Number(pp.normalsK) });
    if (!ops.length) { setError("Choose at least one operation."); return; }
    setBusy("Preprocessing…"); try { const r = await api.preprocess(cloud.id, version, ops); setInfo(r.steps.map((s) => `${s.op}: ${num(s.before)} → ${num(s.after)} points`).join(" · ")); await refresh(r.version.id); } catch (e) { fail(e); } finally { setBusy(""); }
  };
  const runClassify = async () => { if (!api || !cloud) return; setError(""); setBusy("Classifying…"); try { await api.classify(cloud.id, version, { method: cp.method, cell: Number(cp.cell), ground_tolerance: Number(cp.tol), feature_radius: Number(cp.rad) }); await refresh(); } catch (e) { fail(e); } finally { setBusy(""); } };
  const runWires = async () => {
    if (!api || !cloud) return; setError(""); setBusy("Detecting wire candidates…"); const params: Record<string, number> = {}; for (const [k, v] of Object.entries(wp)) if (v !== "") params[k] = Number(v);
    try { const r = await api.detectWires(cloud.id, version, params); setInfo(r.wires.length ? `${r.wires.length} wire candidate(s) found.` : String((r.diagnostics as { reason?: string }).reason ?? "No wire candidates.")); await refresh(); } catch (e) { fail(e); } finally { setBusy(""); }
  };

  const selector = (key: string): Selector | null => {
    if (key === "pick1") return picks[0] ? { kind: "point", xyz: picks[0] } : null; if (key === "pick2") return picks[1] ? { kind: "point", xyz: picks[1] } : null; if (key === "ground") return { kind: "ground" };
    if (key === "object") return picks[0] ? { kind: "object", label: Number(objLabel), near: picks[0], radius: Number(objR) } : { kind: "object", label: Number(objLabel) };
    if (key.startsWith("W")) return { kind: "wire", id: key }; return null;
  };
  const runMeasure = async () => {
    if (!api || !cloud) return; setError(""); const a = selector(mA), b = selector(mB);
    if (!a || !b) { setError("Pick the points you need first: use the Pick tool, then click points in the viewport."); return; }
    try { const m = await api.measure(cloud.id, version, a, b, mLabel, thrOn ? { value: Number(thrV), unit: thrU } : undefined); setMeas((x) => [...x, m]); setSelMeas(m.id); } catch (e) { fail(e); }
  };
  const delMeas = async (id: string) => { if (!api || !cloud) return; await api.deleteMeasurement(cloud.id, id).catch(() => undefined); setMeas((x) => x.filter((m) => m.id !== id)); if (selMeas === id) setSelMeas(null); };

  const counts = ver?.classification?.counts; const hasLabels = !!ver?.classification;
  const stateText = service === "online" ? (cloud ? `${num(ver?.points ?? 0)} points · ${unit}` : "Service online") : service === "offline" ? "Service not connected" : "Checking service…";

  return (
    <DemoShell branding={branding} app="LiDAR Point Cloud & Wire Measurement" project={cloud?.name ?? "No point cloud loaded"} status={stateText} badge="Computer Vision · prototype" back={{ href: "/portfolio/computer-vision", label: "Computer Vision portfolio", all: "← All CV demos" }} contact="/contact?division=computer-vision"
      footer="Classification is provided labels or documented geometric heuristics, not a trained model. Wire candidates are geometric evidence of thin elevated line-like structures and are not verified as wires. Distances are computed from the cloud's own coordinates; if the file does not state its units, values stay in coordinate units until you declare them. Thresholds are your own criteria, not regulatory determinations.">
      <div className="mx-auto grid max-w-[120rem] grid-cols-[minmax(0,1fr)] gap-3 p-3 sm:p-4 lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
        {/* ---------- left: data + processing ---------- */}
        <div className="min-w-0 space-y-3">
          <section className={CARD} aria-label="Data">
            <h2 className={`${H3} mb-2`}>Point cloud</h2>
            <label className={`${BTN} flex cursor-pointer items-center justify-center ${service !== "online" ? "pointer-events-none opacity-40" : ""}`}>Open a file…<input type="file" hidden accept={ACCEPT} data-testid="file-input" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <p className="mt-1 text-[11px] text-slate-500">PLY, PCD, LAS/LAZ, XYZ/TXT/CSV{health ? ` · up to ${health.limits.max_file_mb} MB / ${num(health.limits.max_points)} points` : ""}</p>
            <ul className="mt-2 space-y-1" data-testid="samples">
              {samples.map((s) => <li key={s.id}><button type="button" disabled={service !== "online" || !!busy} className="w-full rounded border border-slate-700 p-2 text-left text-xs text-slate-200 hover:border-amber-500 disabled:opacity-40" onClick={() => void openSample(s)} data-testid={`sample-${s.id}`}><b className="block text-slate-100">{s.title}</b><span className="text-[11px] text-slate-400">{num(s.points)} points · {s.kind === "synthetic" ? "synthetic" : "real airborne lidar"} · {s.licence.split(",")[0].split(";")[0]}</span></button></li>)}
              {!samples.length && <li className="text-[11px] text-slate-500">No sample listed.</li>}
            </ul>
            {cloud?.sample && <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] leading-snug text-slate-400" data-testid="sample-info"><p>{cloud.sample.description}</p><p className="mt-1"><b className="text-slate-300">Provenance:</b> {cloud.sample.provenance}</p><p className="mt-1"><b className="text-slate-300">Licence:</b> {cloud.sample.licence}</p><p className="mt-1"><b className="text-slate-300">Does not demonstrate:</b> {cloud.sample.does_not_demonstrate.join("; ")}</p></div>}
            {service === "offline" && <p className="mt-2 rounded border border-slate-700 bg-slate-950 p-2 text-[11px] leading-snug text-slate-300" data-testid="offline-note">Processing needs the Python service (<code>services/lidar-wires</code>): it loads LAS/LAZ/PLY/PCD, classifies, detects wire candidates and measures. It is not connected to this site, so nothing can be loaded or measured, and no example data is shown in its place. See <code>docs/lidar/DEPLOYMENT.md</code> and set <code>LIDAR_API_URL</code>.</p>}
          </section>

          {cloud && (
            <section className={CARD} aria-label="Units">
              <h2 className={`${H3} mb-2`}>Coordinate units</h2>
              <p className={`text-xs ${cloud.units.known ? "text-emerald-300" : "text-amber-300"}`} data-testid="units-state">{cloud.units.known ? `${cloud.units.horizontal} (${cloud.units.source}${cloud.units.crs ? `, ${cloud.units.crs}` : ""})` : "Not stated in the file: values are in coordinate units, not metres."}</p>
              {cloud.units.notes.map((n) => <p key={n} className="mt-1 text-[11px] text-amber-200">{n}</p>)}
              <label className="mt-2 block text-[11px] text-slate-400">Declare units<select className={`${INPUT} mt-1 w-full`} value={cloud.units.known ? cloud.units.horizontal : "unknown"} onChange={(e) => void setUnits(e.target.value)} data-testid="units-select">{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">Declaring units changes how values are labelled and converted; coordinates are never rescaled. Distance settings below are in {unit}.</p>
              {cloud.defaults.note && <p className="mt-1 text-[10px] text-slate-500">{cloud.defaults.note}</p>}
            </section>
          )}

          {cloud && ver && (
            <section className={CARD} aria-label="Preprocessing">
              <h2 className={`${H3} mb-2`}>Preprocess</h2>
              <div className="space-y-1.5 text-xs text-slate-300">
                <label className="flex items-center gap-2"><input type="checkbox" checked={pp.doVoxel} onChange={(e) => setPp({ ...pp, doVoxel: e.target.checked })} data-testid="pp-voxel-on" />Voxel downsample<input className={`${INPUT} ml-auto w-20`} value={pp.voxel} onChange={(e) => setPp({ ...pp, voxel: e.target.value })} aria-label="Voxel size" data-testid="pp-voxel" />{unit}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={pp.doSor} onChange={(e) => setPp({ ...pp, doSor: e.target.checked })} data-testid="pp-sor-on" />Statistical outlier removal<input className={`${INPUT} ml-auto w-12`} value={pp.sorK} onChange={(e) => setPp({ ...pp, sorK: e.target.value })} aria-label="Neighbours k" />k<input className={`${INPUT} w-12`} value={pp.sorStd} onChange={(e) => setPp({ ...pp, sorStd: e.target.value })} aria-label="Std ratio" />σ</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={pp.doRor} onChange={(e) => setPp({ ...pp, doRor: e.target.checked })} />Radius outlier removal<input className={`${INPUT} ml-auto w-14`} value={pp.rorR} onChange={(e) => setPp({ ...pp, rorR: e.target.value })} aria-label="Radius" />{unit}<input className={`${INPUT} w-10`} value={pp.rorN} onChange={(e) => setPp({ ...pp, rorN: e.target.value })} aria-label="Minimum neighbours" />n</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={pp.doNormals} onChange={(e) => setPp({ ...pp, doNormals: e.target.checked })} />Estimate normals<input className={`${INPUT} ml-auto w-12`} value={pp.normalsK} onChange={(e) => setPp({ ...pp, normalsK: e.target.value })} aria-label="Normals k" />k</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={pp.cropOn} onChange={(e) => { const b = ver.bounds; setPp({ ...pp, cropOn: e.target.checked, lo: pp.lo[0] ? pp.lo : b.min.map((v) => fmt(v, 2)), hi: pp.hi[0] ? pp.hi : b.max.map((v) => fmt(v, 2)) }); }} data-testid="pp-crop-on" />Crop to box</label>
                {pp.cropOn && <div className="grid grid-cols-3 gap-1 text-[11px]" data-testid="crop-box">{["x", "y", "z"].map((a, i) => <div key={a}><input className={`${INPUT} w-full`} value={pp.lo[i]} onChange={(e) => setPp({ ...pp, lo: pp.lo.map((v, j) => (j === i ? e.target.value : v)) })} aria-label={`min ${a}`} /><input className={`${INPUT} mt-1 w-full`} value={pp.hi[i]} onChange={(e) => setPp({ ...pp, hi: pp.hi.map((v, j) => (j === i ? e.target.value : v)) })} aria-label={`max ${a}`} /></div>)}</div>}
                <button type="button" className={GO} disabled={!!busy} onClick={() => void runPre()} data-testid="pp-run">Create processed version</button>
              </div>
              {ver.log.length > 0 && <ul className="mt-2 text-[11px] text-slate-400" data-testid="pp-log">{ver.log.map((l, i) => <li key={i}>{l.op}: <b className="text-slate-200">{num(l.before)} → {num(l.after)}</b> points</li>)}</ul>}
            </section>
          )}

          {cloud && ver && (
            <section className={CARD} aria-label="Classification">
              <h2 className={`${H3} mb-2`}>Classify</h2>
              <div className="space-y-1.5 text-xs text-slate-300">
                <label className="flex items-center gap-2">Method<select className={`${INPUT} ml-auto`} value={cp.method} onChange={(e) => setCp({ ...cp, method: e.target.value })} data-testid="cl-method"><option value="auto">auto (labels if present)</option><option value="provided" disabled={!ver.attributes.provided_classification}>provided labels</option><option value="heuristic">geometric heuristic</option></select></label>
                <label className="flex items-center gap-2">Ground cell<input className={`${INPUT} ml-auto w-16`} value={cp.cell} onChange={(e) => setCp({ ...cp, cell: e.target.value })} aria-label="Ground cell" />{unit}</label>
                <label className="flex items-center gap-2">Ground tolerance<input className={`${INPUT} ml-auto w-16`} value={cp.tol} onChange={(e) => setCp({ ...cp, tol: e.target.value })} aria-label="Ground tolerance" />{unit}</label>
                <label className="flex items-center gap-2">Feature radius<input className={`${INPUT} ml-auto w-16`} value={cp.rad} onChange={(e) => setCp({ ...cp, rad: e.target.value })} aria-label="Feature radius" />{unit}</label>
                <button type="button" className={GO} disabled={!!busy} onClick={() => void runClassify()} data-testid="cl-run">Classify</button>
              </div>
              {ver.classification && <p className="mt-2 text-[11px] leading-snug text-slate-400" data-testid="cl-info"><b className={ver.classification.source === "heuristic" ? "text-amber-300" : "text-emerald-300"}>{ver.classification.source === "heuristic" ? "Heuristic classification" : "Provided labels"}</b>: {ver.classification.kind}{ver.classification.seconds ? ` (${ver.classification.seconds}s)` : ""}.</p>}
            </section>
          )}

          {cloud && ver && (
            <section className={CARD} aria-label="Wire detection">
              <h2 className={`${H3} mb-2`}>Wire candidates</h2>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-slate-300">
                {([["min_height", "Min height above ground"], ["radius", "Neighbourhood radius"], ["min_linearity", "Min linearity (0-1)"], ["link", "Link distance"], ["min_length", "Min length"], ["inlier_tol", "Fit tolerance"], ["max_rms", "Max RMS residual"], ["min_support", "Min points"]] as const).map(([k, l]) => (
                  <label key={k} className="block">{l}<input className={`${INPUT} mt-0.5 w-full`} placeholder={String(cloud.defaults.wires[k])} value={wp[k] ?? ""} onChange={(e) => setWp({ ...wp, [k]: e.target.value })} data-testid={`wp-${k}`} /></label>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Distances in {unit}; empty = default shown.</p>
              <button type="button" className={`${GO} mt-2`} disabled={!!busy || !hasLabels} title={hasLabels ? "" : "Classify first: wire detection needs a ground model"} onClick={() => void runWires()} data-testid="wires-run">Detect wire candidates</button>
              {!hasLabels && <p className="mt-1 text-[10px] text-slate-500">Classify the cloud first: wires are measured against the ground model.</p>}
            </section>
          )}
        </div>

        {/* ---------- center: viewport + measurement table ---------- */}
        <div className="min-w-0 space-y-3">
          <section className={`${CARD} p-2`} aria-label="3D viewport">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
              <h2 className={H3}>Viewport</h2>
              <label>Colour<select className={`${INPUT} ml-1`} value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)} data-testid="color-mode">
                <option value="height">height (elevation)</option><option value="hag" disabled={!data?.meta.has_hag}>height above ground</option><option value="rgb" disabled={!data?.meta.has_rgb}>RGB</option><option value="intensity" disabled={!data?.meta.has_intensity}>intensity</option><option value="classification" disabled={!data?.meta.has_labels}>classification</option><option value="flat">flat</option></select></label>
              <label>Point size<input type="range" min={1} max={8} step={0.5} value={pointSize} onChange={(e) => setPointSize(Number(e.target.value))} className="ml-1 w-20 align-middle" data-testid="point-size" /></label>
              <label>Background<select className={`${INPUT} ml-1`} value={bg} onChange={(e) => setBg(e.target.value)} data-testid="bg"><option value="#0b1220">dark blue</option><option value="#000000">black</option><option value="#e2e8f0">light</option></select></label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={bbox} onChange={(e) => setBbox(e.target.checked)} data-testid="bbox" />Bounding box</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />Grid</label>
              <span className="ml-auto flex flex-wrap gap-1"><button type="button" className={`${BTN} ${tool === "pick" ? "border-amber-500 text-white" : ""}`} onClick={() => setTool(tool === "pick" ? "orbit" : "pick")} data-testid="tool-pick" aria-pressed={tool === "pick"}>{tool === "pick" ? "Picking points: click the cloud" : "Pick points"}</button>
                <button type="button" className={BTN} onClick={() => viewer.current?.reset()} data-testid="reset-camera">Reset camera</button><button type="button" className={BTN} onClick={() => viewer.current?.view("top")}>Top</button><button type="button" className={BTN} onClick={() => viewer.current?.view("side")}>Side</button></span>
            </div>
            <div className="relative h-[28rem] w-full overflow-hidden rounded-md border border-slate-800 sm:h-[36rem]" data-testid="viewport-box">
              <LidarViewer ref={viewer} data={data} colorMode={colorMode} pointSize={pointSize} background={bg} layers={layers} showBBox={bbox} showGrid={grid} wires={wires} selectedWire={selWire} onSelectWire={setSelWire} picks={picks} tool={tool} onPick={(w) => setPicks((x) => [...x.slice(-2), w])} measurement={curM} />
              {!data && <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-400" data-testid="viewport-empty">{busy || "Open a point cloud or a sample to see it here. Nothing is shown before real data is loaded."}</div>}
              {busy && data && <div className="absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-1 text-xs text-amber-200" role="status" data-testid="busy">{busy}</div>}
              {data?.meta.decimated && <div className="absolute bottom-2 left-2 rounded bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300" data-testid="decimated">showing {num(data.meta.n)} of {num(data.meta.total)} points (display only; processing and measuring use all points)</div>}
            </div>
            {error && <p role="alert" className="mt-2 rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200" data-testid="error">{error}</p>}
            {info && <p className="mt-2 text-xs text-emerald-300" data-testid="info">{info}</p>}
          </section>

          <section className={CARD} aria-label="Measurements">
            <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className={H3}>Measurements</h2>
              {cloud && <span className="ml-auto flex flex-wrap gap-1">{(["measurements.csv", "measurements.json", "wires.json", "ply"] as const).map((k) => <a key={k} className={BTN} href={api!.exportUrl(cloud.id, k, version)} data-testid={`export-${k}`}>{k === "ply" ? "Processed cloud (PLY)" : k.replace(".", " ").replace("json", "JSON").replace("csv", "CSV")}</a>)}</span>}</div>
            {cloud && (
              <div className="mb-3 rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300" data-testid="measure-builder">
                <div className="flex flex-wrap items-end gap-2">
                  {([["A", mA, setMA], ["B", mB, setMB]] as const).map(([n, v, set]) => (
                    <label key={n} className="text-[11px] text-slate-400">{n}<select className={`${INPUT} ml-1`} value={v} onChange={(e) => set(e.target.value)} data-testid={`m-${n}`}>
                      <option value="pick1">Picked point 1{picks[0] ? "" : " (none)"}</option><option value="pick2">Picked point 2{picks[1] ? "" : " (none)"}</option><option value="ground" disabled={!hasLabels}>Ground model</option><option value="object" disabled={!hasLabels}>Object (class near pick 1)</option>{wires.map((w) => <option key={w.id} value={w.id}>Wire {w.id}</option>)}</select></label>
                  ))}
                  <label className="text-[11px] text-slate-400">Object class<select className={`${INPUT} ml-1`} value={objLabel} onChange={(e) => setObjLabel(e.target.value)}>{LABELS.map((l) => <option key={l} value={l}>{LABEL_NAME[l]}</option>)}</select></label>
                  <label className="text-[11px] text-slate-400">within<input className={`${INPUT} mx-1 w-14`} value={objR} onChange={(e) => setObjR(e.target.value)} aria-label="Object radius" />{unit}</label>
                  <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={thrOn} onChange={(e) => setThrOn(e.target.checked)} data-testid="thr-on" />my minimum<input className={`${INPUT} w-14`} value={thrV} onChange={(e) => setThrV(e.target.value)} aria-label="Threshold" data-testid="thr-v" /><select className={INPUT} value={thrU} onChange={(e) => setThrU(e.target.value)} aria-label="Threshold unit"><option value="m">m</option><option value="ft">ft</option><option value="coordinate">coord. units</option></select></label>
                  <input className={`${INPUT} w-36`} placeholder="Label (optional)" value={mLabel} maxLength={60} onChange={(e) => setMLabel(e.target.value)} aria-label="Measurement label" />
                  <button type="button" className={GO} onClick={() => void runMeasure()} data-testid="measure">Measure</button>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">Picked points: {picks.length ? picks.map((p, i) => `#${i + 1} (${p.map((v) => fmt(v, 2)).join(", ")})`).join(" · ") : "none: switch on “Pick points” and click the cloud"}{picks.length ? <button type="button" className="ml-2 underline" onClick={() => setPicks([])}>clear</button> : null}</p>
              </div>
            )}
            <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-xs text-slate-200" data-testid="meas-table">
              <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="py-1 pr-2">ID</th><th className="pr-2">Type</th><th className="pr-2">Objects</th><th className="pr-2 text-right">Value</th><th className="pr-2">Unit</th><th className="pr-2">Method</th><th className="pr-2">Status</th><th /></tr></thead>
              <tbody>
                {meas.map((m) => (
                  <tr key={m.id} className={`cursor-pointer border-t border-slate-800 ${selMeas === m.id ? "bg-amber-500/10" : "hover:bg-slate-800/60"}`} onClick={() => { setSelMeas(m.id); viewer.current?.focus(m.closest_points[0]); }} data-testid={`meas-${m.id}`}>
                    <td className="py-1.5 pr-2 font-semibold">{m.id}</td><td className="pr-2">{TYPE_LABEL[m.type] ?? m.type}{m.label ? <span className="block text-[10px] text-slate-500">{m.label}</span> : null}</td><td className="pr-2 text-[11px] text-slate-400">{m.geometry.join(" ↔ ")}</td>
                    <td className="pr-2 text-right tabular-nums font-semibold text-slate-50" data-testid={`meas-value-${m.id}`}>{fmt(m.value, 3)}</td><td className="pr-2">{m.unit}{m.units_known && m.value_m !== undefined && m.unit !== "m" ? <span className="block text-[10px] text-slate-500">{fmt(m.value_m, 3)} m</span> : null}</td>
                    <td className="max-w-[18rem] pr-2 text-[11px] text-slate-400">{m.method}{m.threshold_check && <span className={`mt-1 block ${m.threshold_check.status === "meets" ? "text-emerald-300" : m.threshold_check.status === "below" ? "text-red-300" : "text-amber-300"}`}>{m.threshold_check.status === "not_evaluated" ? "threshold not evaluated" : `${m.threshold_check.status} your ${m.threshold_check.threshold} ${m.threshold_check.unit} minimum`}: {m.threshold_check.note}</span>}{m.notes.map((n) => <span key={n} className="mt-1 block text-amber-200">{n}</span>)}</td>
                    <td className="pr-2"><span className={m.status === "ok" ? "text-emerald-300" : "text-amber-300"}>{m.status === "units_unknown" ? "units unknown" : m.status}</span></td><td><button type="button" className="text-slate-500 hover:text-red-300" onClick={(e) => { e.stopPropagation(); void delMeas(m.id); }} aria-label={`Delete ${m.id}`}>✕</button></td>
                  </tr>
                ))}
                {!meas.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500" data-testid="meas-empty">No measurements yet. Pick points or select wires, then choose what to measure.</td></tr>}
              </tbody></table></div>
            {curM && Object.keys(curM.components).length > 0 && <p className="mt-2 text-[11px] text-slate-400" data-testid="meas-components">{curM.id} components: {Object.entries(curM.components).map(([k, v]) => `${k.replace(/_/g, " ")} ${fmt(v, 3)} ${curM.unit}`).join(" · ")}</p>}
          </section>
        </div>

        {/* ---------- right: inspector, layers, wires ---------- */}
        <div className="min-w-0 space-y-3 lg:col-span-2 2xl:col-span-1">
          <section className={CARD} aria-label="Summary">
            <h2 className={`${H3} mb-2`}>Cloud</h2>
            {cloud && ver ? (
              <>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs [&_dd]:text-right [&_dd]:tabular-nums [&_dd]:text-slate-100 [&_dt]:text-slate-400" data-testid="summary">
                  <dt>Points</dt><dd data-testid="s-points">{num(ver.points)}</dd><dt>Extent X</dt><dd>{fmt(ver.bounds.extent[0])} {unit}</dd><dt>Extent Y</dt><dd>{fmt(ver.bounds.extent[1])} {unit}</dd><dt>Extent Z</dt><dd>{fmt(ver.bounds.extent[2])} {unit}</dd><dt>Z range</dt><dd>{fmt(ver.bounds.min[2])} … {fmt(ver.bounds.max[2])}</dd>
                  <dt>RGB</dt><dd>{ver.attributes.rgb ? "yes" : "no"}</dd><dt>Intensity</dt><dd>{ver.attributes.intensity ? "yes" : "no"}</dd><dt>Provided labels</dt><dd>{ver.attributes.provided_classification ? "yes" : "no"}</dd>
                </dl>
                {ver.provided_codes && <details className="mt-1 text-[11px] text-slate-400"><summary className="cursor-pointer">Provided classification codes</summary><ul>{Object.entries(ver.provided_codes).map(([k, v]) => <li key={k}>{k}: {num(v)}</li>)}</ul></details>}
                {cloud.warnings.map((w) => <p key={w} className="mt-1 text-[11px] text-amber-200">{w}</p>)}
                <div className="mt-2 flex flex-wrap gap-1" data-testid="versions" role="tablist" aria-label="Versions">{cloud.versions.map((v) => <button key={v.id} role="tab" aria-selected={v.id === version} type="button" className={`${BTN} ${v.id === version ? "border-amber-500 text-white" : ""}`} onClick={() => { setVersion(v.id); setPicks([]); void load(cloud, v.id); }} title={v.description} data-testid={`ver-${v.id}`}>{v.id}: {num(v.points)}</button>)}</div>
                <p className="mt-1 text-[10px] text-slate-500">{ver.description}</p>
              </>
            ) : <p className="text-xs text-slate-500">No data loaded.</p>}
          </section>

          <section className={CARD} aria-label="Classification layers">
            <h2 className={`${H3} mb-2`}>Layers</h2>
            {data ? (
              <ul className="space-y-1 text-xs" data-testid="layers">
                {LABELS.map((l) => { const c = counts ? counts[LABEL_NAME[l]] ?? 0 : l === 0 ? data.meta.total : 0; if (counts ? c === 0 : l !== 0) return null; return (
                  <li key={l}><label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={layers[l] !== false} onChange={(e) => setLayers({ ...layers, [l]: e.target.checked })} data-testid={`layer-${l}`} /><span className="inline-block h-3 w-3 rounded-sm" style={{ background: LABEL_COLOR[l] }} />{LABEL_NAME[l]}{hasLabels && ver?.classification?.source === "heuristic" && l !== 0 && l !== 4 ? <span className="text-[10px] text-amber-300">(heuristic)</span> : null}<span className="ml-auto tabular-nums text-slate-400">{num(c)}</span></label></li>); })}
                {!hasLabels && <li className="text-[11px] text-slate-500">Layers appear after classification. Until then every point is “unclassified”.</li>}
              </ul>
            ) : <p className="text-xs text-slate-500">Layers appear when data is loaded.</p>}
          </section>

          <section className={CARD} aria-label="Wire candidates" data-testid="wire-panel">
            <h2 className={`${H3} mb-2`}>Detected structures</h2>
            {ver?.wires ? (
              <>
                <p className="text-[11px] text-slate-400" data-testid="wire-summary">{wires.length ? `${wires.length} wire candidate(s) from ${num(ver.wires.diagnostics.candidates_linear)} line-like elevated points.` : ver.wires.diagnostics.reason}</p>
                <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-xs">
                  {wires.map((w) => (
                    <li key={w.id}><button type="button" className={`w-full rounded border p-1.5 text-left ${selWire === w.id ? "border-amber-500 bg-amber-500/10" : "border-slate-700 hover:border-slate-500"}`} onClick={() => { setSelWire(selWire === w.id ? null : w.id); viewer.current?.focus(w.endpoints[0]); }} data-testid={`wire-${w.id}`}>
                      <b className="text-slate-100">{w.id}</b> <span className={w.quality === "strong" ? "text-emerald-300" : w.quality === "moderate" ? "text-amber-300" : "text-slate-400"}>{w.quality}</span> · {num(w.support_points)} pts · {fmt(w.length, 1)} {unit}<span className="block text-[10px] text-slate-500">{w.curve_model}, sag {fmt(w.sag, 2)}, RMS {fmt(w.rms_residual, 3)} {unit}, coverage {Math.round(w.coverage * 100)}%</span></button></li>
                  ))}
                </ul>
                {selWire && (() => { const w = wires.find((x) => x.id === selWire); return w ? <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] leading-snug text-slate-400" data-testid="wire-detail"><p><b className="text-slate-200">{w.id}</b> endpoints: ({w.endpoints[0].map((v) => fmt(v, 2)).join(", ")}) → ({w.endpoints[1].map((v) => fmt(v, 2)).join(", ")})</p><p>Horizontal span {fmt(w.span_horizontal, 2)} · 3D length {fmt(w.length, 2)} · max residual {fmt(w.max_residual, 3)} {unit}</p><p className="mt-1">Method: {w.method}</p><p className="mt-1 text-amber-200">{w.limitations}</p></div> : null; })()}
                <p className="mt-2 text-[10px] leading-snug text-slate-500">{ver.wires.honesty}</p>
              </>
            ) : <p className="text-xs text-slate-500" data-testid="wire-empty">Run “Detect wire candidates” after classifying. Only structures supported by the data are listed.</p>}
          </section>
        </div>
      </div>
    </DemoShell>
  );
}
