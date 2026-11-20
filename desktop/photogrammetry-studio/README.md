# PhotoMesh Studio

A desktop application that turns noisy photogrammetry scans (for example Apple Object Capture output from an iPhone) into clean, optimised 3D meshes. Real processing, no mock results: the React interface talks to a local Python engine (Open3D, PyMeshLab, Trimesh, NumPy, SciPy) that runs every algorithm on the files you import.

```
┌───────────────┐  http://127.0.0.1 (loopback only)  ┌───────────────────────────────┐
│ React + R3F   │ ─────────────────────────────────▶ │ FastAPI engine (pgengine)     │
│ UI (ui/)      │ ◀───────────────────────────────── │  job manager ──▶ worker       │
└──────┬────────┘                                    │  processes (spawned, killable)│
       │ hosted in                                   └───────────────────────────────┘
┌──────▼────────┐
│ Tauri shell   │  src-tauri/: starts the engine, opens the window, stops the engine on exit
└───────────────┘
```

## What is verified, and what is not
Verified in the development environment (Linux, CPU only):
- **Engine:** `engine/tests` (27 tests, real files and real worker processes): import of PLY, OBJ, STL, PCD, XYZ/XYZN, GLB, LAS, LAZ, USDZ and OBJ+MTL+texture; cleaning; all four reconstruction methods measured against the true surface; every refinement operation; validation; export round-trips; undo/redo; save/open; cancel; error handling.
- **Interface:** `tests/ui-test.mjs` (40 checks in a real Chromium browser against the running engine): import, viewport controls, every module, before/after comparison, history, presets, save/open, export (files are downloaded and parsed), cancel.
- **Standalone engine:** built with PyInstaller on Linux (`engine/pgengine.spec`, output folder about 1.7 GB because Open3D, PyMeshLab and OpenUSD are bundled). The frozen executable started, served the interface, created the sample project and ran the Quick preset through its worker processes.
- **Desktop shell:** the Tauri 2 shell (`src-tauri/`) compiled on Linux (`cargo build`, with `libwebkit2gtk-4.1-dev`), started the engine, opened a native 1500×950 window and processed the sample through the full pipeline (checked under a virtual X server, with WebKitGTK software rendering).

**Not verified:** installers (`cargo tauri build`), the Tauri shell with the *packaged* engine, and every Windows and macOS build were not made. GPU acceleration is not available in the pip build of Open3D; every algorithm runs on the CPU (the toolbar shows "CPU"). Apple Object Capture files from a real iPhone were not available for testing; the sample is a real 3D asset (the Stanford Bunny) degraded on purpose.

## Install and run (development, any OS with Python 3.10+ and Node 18+)
```bash
# 1. engine
cd desktop/photogrammetry-studio/engine
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Linux only, if Open3D complains about libEGL/libGL:  sudo apt-get install -y libegl1 libgl1 libgomp1 libopengl0

# 2. interface
cd ../ui && npm install && npm run build

# 3. start (opens your browser; the engine serves the built interface)
cd ../engine && python -m pgengine
#   python -m pgengine --port 9000 --no-open        # custom port, do not open a browser
#   pip install pywebview && python -m pgengine --window   # native window without Tauri
```
Interface development with hot reload: run the engine on port 8765, then `npm run dev` in `ui/` (port 5173, proxied to the engine).

## Build the standalone application
1. **Engine executable (PyInstaller):** `cd engine && pip install pyinstaller && pyinstaller pgengine.spec` creates `dist/pgengine/` containing the `pgengine` executable with Open3D, PyMeshLab and the built UI inside. Run it directly (it prints the address; open it in a browser) or put the folder in `engine-dist/` for step 2.
2. **Desktop installer (Tauri 2):** install Rust and the Tauri prerequisites for your OS (https://tauri.app/start/prerequisites/), build the UI (`ui/npm run build`), copy the contents of the PyInstaller output folder (`engine/dist/pgengine/*`) into `desktop/photogrammetry-studio/engine-dist/`, then `cargo install tauri-cli --version "^2"` and `cargo tauri build` from `src-tauri/`. The shell starts the engine on a free loopback port, waits for `/api/health`, opens the window, and kills the engine when the window closes. Add icons to `src-tauri/icons` and list them in `tauri.conf.json` before building installers.
Build each platform on its own OS (PyInstaller and Tauri do not cross-compile).

## The workflow
Left sidebar, in order:
1. **Import Project:** drag and drop or browse (several files at once, e.g. OBJ + MTL + texture). Shows point count, bounding box, coordinates, RGB presence, duplicate and invalid points, typical spacing.
2. **Point Cloud Cleanup:** crop box; invalid and duplicate points; statistical and radius outlier removal; isolated-point detection; density filtering; floating-artifact removal; feature-preserving noise filtering; downsampling (voxel with feature preservation, random, uniform, or a target point count).
3. **Surface Reconstruction:** Poisson and Screened Poisson, Ball Pivoting, Alpha Shapes. "Analyse scan" measures density, uniformity and noise and recommends a method with the reasons. A **trim distance** removes any surface farther than a chosen multiple of the point spacing from measured data, so gaps stay open instead of being invented.
4. **Mesh Refinement:** Taubin, Laplacian, bilateral (edge-aware) and regularising smoothing with feature preservation, curvature awareness and a hard movement limit; hole repair up to a size; non-manifold repair; normal correction; degenerate triangles; small-component removal; adaptive remeshing; local refinement; quadric decimation (boundary, normal and planar options); mesh optimisation; subdivision-surface preview.
5. **Texture Processing:** transfer colours from the point cloud, bake a texture to vertex colours, smooth vertex colours (geometry untouched).
6. **Mesh Validation:** polygons, vertices, watertightness, non-manifold edges, holes, normal consistency, degenerate triangles, components, bounding box, area, volume, distance to the points, and (sample only) distance to the true surface.
7. **Export:** OBJ, PLY, STL, GLB, GLTF (zip) with scale, orientation, centring, texture/colour preservation, and simplification by percentage or polygon budget (applied to the export copy).

Top toolbar: New, Open and Save (`.pgproj`), Undo/Redo (also Ctrl+Z / Ctrl+Y), Reset View, preset selector, **Process** (the whole pipeline with the current settings), Export. Bottom: progress with **Cancel**, operation history, console. **Compare** (viewport toolbar): slider or side-by-side, any two of original / cleaned / reconstructed / refined; stages are never overwritten.

### Presets
Quick Cleanup · Balanced Reconstruction · High Quality · Product Quality · Organic Objects · Hard Surface. A preset loads a full set of values into the panels; change anything afterwards. They are starting points tuned on the sample scans, not guarantees.

## Honest limits
- **Texture atlases:** a texture map and UVs survive only while the topology is unchanged. Reconstruction, decimation and remeshing bake colours to vertices. Re-baking a new atlas and UV unwrapping are **not implemented** (the interface says so).
- **GPU:** none; CPU only. Very large scans (tens of millions of points) need downsampling first; the display is decimated for speed while processing uses the full data. A worker that runs out of memory is reported as an error.
- **USDZ:** geometry and vertex display colours are read; textures inside USDZ packages are not.
- **Poisson-type methods fill holes.** Use the trim distance and check the validation report. Smoothing is limited to a fraction of an edge length per vertex, and the size change is reported.
- **No cloud, no accounts:** everything runs on your machine; the engine listens on 127.0.0.1 only. Temporary workspaces live in `~/.photomesh-studio/workspaces` (override with `PGS_HOME`) and workspaces untouched for 7 days are deleted when a new project is created.

See `docs/PIPELINE.md` for the algorithms and `engine/tests` for the test suite (`cd engine && pip install pytest httpx && PYTHONPATH=. pytest tests`).
