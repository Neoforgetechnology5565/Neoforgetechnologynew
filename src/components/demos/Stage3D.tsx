"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface View { pos: [number, number, number]; target: [number, number, number] }
export interface StageCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Everything that can be clicked is added to this group. */
  pick: THREE.Group;
  invalidate: () => void;
  goto: (v: View) => void;
  reset: () => void;
  zoom: (factor: number) => void;
}

/**
 * Reusable 3D viewport: orbit / zoom / pan, render-on-demand, click picking, loading and no-WebGL states.
 * The parent adds its meshes to ctx.scene (or ctx.pick for clickable ones) once onReady fires.
 */
export default function Stage3D({ home, onReady, onPick, shadows, className = "", toolbar, children, label }: {
  home: View; onReady: (ctx: StageCtx) => void; onPick?: (obj: THREE.Object3D | null) => void;
  shadows?: boolean; className?: string; toolbar?: ReactNode; children?: ReactNode; label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<StageCtx | null>(null);
  const pickCb = useRef(onPick);
  pickCb.current = onPick;
  const homeRef = useRef(home);
  homeRef.current = home;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    } catch {
      setState("error");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !!shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.prepend(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.screenSpacePanning = true;
    const pickGroup = new THREE.Group();
    scene.add(pickGroup);

    let raf = 0, dirty = true, alive = true;
    const invalidate = () => { dirty = true; if (!raf && alive) raf = requestAnimationFrame(loop); };
    function loop() { raf = 0; if (!dirty || !alive) return; dirty = false; renderer.render(scene, camera); }
    const goto = (v: View) => { camera.position.set(...v.pos); controls.target.set(...v.target); controls.update(); invalidate(); };
    const ctx: StageCtx = {
      scene, camera, renderer, controls, pick: pickGroup, invalidate, goto,
      reset: () => goto(homeRef.current),
      zoom: (f) => { const d = camera.position.clone().sub(controls.target).multiplyScalar(f); camera.position.copy(controls.target).add(d); controls.update(); invalidate(); },
    };
    ctxRef.current = ctx;
    controls.addEventListener("change", invalidate);

    const size = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.fov = camera.aspect < 1.2 ? Math.min(78, 40 * Math.pow(1.2 / camera.aspect, 0.75)) : 40; camera.updateProjectionMatrix(); invalidate();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el); size();
    goto(homeRef.current);

    // click picking (ignores drags)
    let down: { x: number; y: number } | null = null;
    const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hits = ray.intersectObjects(pickGroup.children, true).filter((h) => h.object.visible && (h.object as THREE.Mesh).isMesh && h.object.userData.id);
      pickCb.current?.(hits[0]?.object ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    onReady(ctx);
    setState("ready");
    return () => {
      alive = false; cancelAnimationFrame(raf);
      ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose()); });
      renderer.dispose(); renderer.domElement.remove(); ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = "rounded-md border border-slate-600 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-white";
  return (
    <div className={`relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900 ${className}`}>
      <div ref={host} className="absolute inset-0" role="img" aria-label={label} />
      {state === "loading" && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading 3D model…</div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-amber-300">The 3D view could not start in this browser (WebGL is unavailable). Try a current version of Chrome, Edge, Firefox or Safari.</div>}
      {state === "ready" && (
        <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1.5">
          <button type="button" className={btn} onClick={() => ctxRef.current?.reset()}>Reset camera</button>
          <button type="button" className={btn} aria-label="Zoom in" onClick={() => ctxRef.current?.zoom(0.8)}>＋</button>
          <button type="button" className={btn} aria-label="Zoom out" onClick={() => ctxRef.current?.zoom(1.25)}>－</button>
          {toolbar}
        </div>
      )}
      {state === "ready" && <p className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-slate-950/70 px-2 py-1 text-[10px] text-slate-400">Drag to orbit · right-drag or two fingers to pan · scroll to zoom</p>}
      {children}
    </div>
  );
}
