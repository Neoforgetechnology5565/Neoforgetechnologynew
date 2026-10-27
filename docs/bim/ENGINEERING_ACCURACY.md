# Engineering methods, accuracy and limits

All results are **preliminary aids**. Nothing here is a verified design, code-compliance, structural, fire or construction document.

## 2D → 3D (demonstrations 1, 6)
- **Units:** DXF `$INSUNITS` when declared; otherwise a guess from the drawing size, **flagged as ambiguous** and shown for confirmation. SVG and raster images have no real units: the scale is asked for. A dimension-entity check compares drawn measurements with the extracted geometry (`scaleCheck`).
- **Walls:** double-line drawings (paired parallel faces whose distance is in `thicknessRange`, merged across ≤ 0.32 m gaps) → centrelines with measured thickness; single-line drawings → configured thickness (marked assumed). Straight segments only; **curved walls are not converted**.
- **Openings:** door swing arcs and window symbols attached to walls; a gap with no symbol becomes an *unlabelled opening* with a warning. Heights, sills, slab thickness and roof are **configurable assumptions** (a plan does not carry them) and are listed on every output.
- **Rooms:** half-edge planar graph of the wall centrelines. *Net* area is measured inside the wall faces (edge-wise half-thickness inset); *gross* area is to centrelines. Names come from text labels inside the polygon, otherwise generated (flagged).
- **Raster plans:** axis-aligned thick strokes → wall rectangles. Diagonal walls and hatching are skipped and reported. The result is an inference, not CAD geometry.

## MEP (demonstrations 1, 8)
Per-layer configuration (system, category, elevation, size) with annotation overrides (`400x250`, `Ø150`, `EL+2.60`). **Every defaulted value is recorded in `assumed`.** Elbows/tees are inferred; networks are connected components of elements joined within tolerance. IFC distribution elements are read as bounding-box elements. **No airflow, pressure, heat load, pipe sizing or capacity is computed.** Risers are not inferred from 2D.

## Clash detection
Oriented-box SAT (exact for boxes), round-vs-round segment distance minus radii (exact), segment vs slab prism; round-vs-box uses the box's bounding box (noted in the result). **Hard** = penetration deeper than `clashTolerance`; **clearance** = gap smaller than `clearance` but no penetration. Severity high ≥ 0.10 m, medium ≥ 0.03 m, otherwise low; clearance findings are warnings. Connected ends and equipment/terminal/fitting connections are ignored; results are de-duplicated per element pair. IFC elements are tested at AABB level. A clean result does **not** prove the model is clash-free.

## Point clouds (demonstration 4)
LAS 1.0–1.4 (formats 0–3, 6–8, uncompressed), PLY, XYZ/CSV, ≤ 4 M points (truncation is reported). Statistical outlier removal (k nearest neighbours in a voxel hash; mean + σ·std). Planes: RANSAC (400 iterations per plane) + least-squares refinement, tolerance configurable (default 2 cm). On the synthetic room (6.00 × 4.00 × 2.60 m, 4 mm noise) planes are recovered within 2 cm for dimensions; plane RMS is reported per plane. The room draft needs a floor, a ceiling and two orthogonal pairs of opposing vertical planes; wall thickness is assumed. No registration, georeferencing or semantic classification is attempted.

## Structural drawings (demonstration 7)
Roles come from layer names (editable). Columns = closed outlines / circles on column layers (size from geometry, tag from nearest text); beams = lines with a nearby `NNNxNNN` label (otherwise a default section, flagged); grid lines are matched to bubble text. Checks are **drafting-consistency** checks: off-grid columns, unsupported beam ends (nothing within 0.15 m), label vs geometry mismatch, missing footing outlines, duplicates. Volumes are geometric under stated storey-height / footing-thickness assumptions. **No structural analysis, design or safety statement.**

## Quantities and cost (demonstration 10)
Measured from the extracted model with the basis stated per line: walls = Σ length × height − opening areas (volume shown); slabs = outline area × thickness; roof = outline (flat) or footprint ÷ cos(pitch) (gable); finishes = room net areas, wall finishes = perimeter × height − openings of bounding walls (openings shared by two rooms are deducted from both — stated); MEP runs = Σ centreline length by size. IFC input uses **only quantities stored in the file**; elements without them are listed under exclusions, never estimated. Waste is a per-line percentage; markups compound in the order overhead → profit → contingency → tax. **Rates are illustrative placeholders** (not market data) and every report says so. Exclusions (site works, foundations, reinforcement, labour productivity, preliminaries, regional price indices, anything not present in the input) are listed.

## BIM validation (demonstration 9)
Fourteen switchable rules with configurable severity/thresholds and a required-property list per class. They are data-completeness and geometry checks (names, GlobalId uniqueness, storey assignment, geometry present, plausible size, duplicates by bounding box, far-away elements, spaces with area, MEP systems, door/window hosting by bounding-box proximity). They are **not** IDS, buildingSMART validation or building-code checks, and findings export as CSV/JSON/HTML/PDF, **not BCF**.

## Interoperability (demonstration 5)
Every conversion is re-read by an independent reader and compared with its source: IFC by web-ifc (class counts, storeys, extents), DXF by the DXF parser (layers, labels), GLB by a container reader (version, length, triangle and mesh counts). Matching counts show the file is consistent; they do not prove visual equivalence in third-party software. The IFC writer's output was additionally validated with ifcopenshell (schema and EXPRESS rules; 0 messages) and the DXF with ezdxf (0 audit errors) during development.

## Collaboration (demonstration 11)
Comparison matches elements by GlobalId; geometry by bounding box (tolerance 1 mm), properties by value, quantities by value (1e-6). A new opening that leaves a wall's bounding box unchanged therefore appears through quantities, not geometry. Roles: owner (everything), reviewer (issues, comments, views, status), viewer (read). Authors are derived from the key, never from the request body.
