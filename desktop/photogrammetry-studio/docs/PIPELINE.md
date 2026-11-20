# Processing pipeline

All code is in `engine/pgengine`. Every operation reads the current project stage, runs in a separate worker process, and commits a new history entry only when it finishes, so Cancel (which terminates the process) never leaves a half-written result.

## Stages and history
`original → cleaned → reconstructed → refined` (+ `preview` for subdivision, `reference` for the sample's noise-free mesh). Each history entry is a snapshot of all stages, so Undo/Redo and the before/after comparison never lose earlier results. Re-running an earlier step drops the stages that depended on it.

## Module A: import (`formats.py`)
Readers: Open3D (PLY, PCD), Trimesh (OBJ, STL, GLB/GLTF), NumPy text parser (XYZ, XYZN, XYZRGB, PTS), laspy (LAS/LAZ, with lazrs for LAZ), OpenUSD (USDZ/USD). Non-finite coordinates are dropped and counted. Colours are normalised to 0–1; LAS 16-bit colours are scaled. Coordinates are kept in float64 on disk; the viewer subtracts the stage centre so large offsets do not lose precision.

## Module B: cleaning (`clean.py`)
- Duplicates: cell hashing at a tolerance (default 1/1000 of the typical spacing).
- Statistical outlier removal: mean distance to k neighbours, threshold = mean + n·σ.
- Radius outlier removal; isolated points and floating artifacts via connected components of the radius graph (SciPy).
- Density filter: local density 1/r_k² against the median.
- Noise filtering: project points on flat areas toward their local best-fit plane (PCA); points with high **surface variation** λ₀/(λ₀+λ₁+λ₂) (edges, corners) are not moved. Automatic feature threshold = the most curved 15 % of points.
- Downsampling: voxel average (features use a 3× finer grid), random, uniform; a target count is found by bisection on the cell size.

## Module C: reconstruction (`reconstruct.py`)
Normals: PCA (Open3D) + consistent tangent-plane orientation. Methods: Poisson (Open3D, density trim), Screened Poisson (PyMeshLab / Kazhdan), Ball Pivoting (radii = spacing × factors), Alpha Shapes (α = spacing × factor). **Recommendation rules** (measured on the cloud): very few points → Alpha Shapes; noise > 0.7× spacing → Screened Poisson; uneven spacing (CV > 0.6) → Poisson; dense, even, low-noise → Ball Pivoting; otherwise Screened Poisson. **Trim:** triangles with a vertex farther than `trim_factor × spacing` from every measured point are removed. Vertex colours come from the nearest points (inverse-distance weights).

## Modules D and E: refinement (`refine.py`)
Smoothing is implemented on sparse mesh operators: Laplacian `x += λ·w·Lx`; Taubin (λ then μ < 0, no shrinkage); bilateral (Fleishman 2003: normal-direction displacement weighted by distance and height difference); regularisation (Laplacian restricted to the tangent plane). Per-vertex weight `w` is 0 on boundaries, `1 − feature_preservation` on sharp edges (dihedral angle > threshold), and optionally reduced where curvature is high. After each iteration vertices are clamped to `max_move × mean edge length` from their original position, which bounds the change in size. Decimation, hole closing, remeshing, subdivision and non-manifold repair use PyMeshLab filters; normals use Trimesh; components and degenerate triangles are handled with SciPy/NumPy. After topology-changing steps the repair steps run again (up to three rounds) until the mesh has no non-manifold edges, inconsistent windings or tiny pieces.

## Module F: colour (`pipeline.py`, `model.py`)
Vertex colours are kept through every step by nearest-point transfer; a texture map with UVs is carried only through topology-preserving steps, and can be baked to vertex colours. Colour clean-up (colour smoothing over the mesh) is separate from geometry smoothing.

## Module G: validation (`validate.py`)
Edge table with face counts → boundary edges (holes, grouped into loops), non-manifold edges (>2 faces), inconsistent windings (adjacent faces traversing a shared edge in the same direction), degenerate and sliver triangles, connected components, signed volume (watertight meshes only), bounding box and area. Deviation from the cleaned points uses an Open3D ray-casting distance field. For the sample, the distance to the noise-free source mesh is measured as well.

## Jobs and performance (`jobs.py`, `api.py`)
Spawned worker processes (true cancellation, memory returned to the OS), progress and log messages over a queue, one job per project. The interface polls every 500 ms. Previews are decimated for display only (points: random subset up to 400k, meshes: quadric to 500k faces); processing always uses the full data.
