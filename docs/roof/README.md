# AI Roof Measurement & Estimation (Computer Vision demo no. 4)

Upload an aerial / top-down image (JPG, PNG, WebP, or a GeoTIFF), and a real segmentation network finds roof-like pixels. The page turns them into roof regions, measures them under the scale **you** supply, and produces a material estimate from **your** assumptions. Frontend `src/components/roof/*` and `src/lib/roof/*`; backend `services/roof-analyzer/` (FastAPI + ONNX Runtime). Route: `/ai-demos/ai-roof-measurement/app`. No database, no accounts, no billing, no prices.

## What is real
* **Segmentation**: a 3-level U-Net (7.8 M parameters) run on the server with ONNX Runtime, tiled at 768 px with feathered blending. Every overlay, mask and probability image comes from that model on that image.
* **Regions and geometry**: thresholding, morphology, connected components, polygon approximation (`approxPolyDP`), minimum-area rectangle and solidity are computed from the mask. Threshold ±0.1 gives an area sensitivity range per region.
* **Measurements**: area, perimeter, edge lengths and rectangle dimensions, computed in pixels and converted to metres/ft only when a defensible scale exists (see `MEASUREMENT.md`). The browser engine (`src/lib/roof/measure.ts`) is the same arithmetic as the service and is checked against it by shared fixtures.
* **Estimate**: arithmetic on the measured area with waste %, coverage per unit and unit prices that the user types in. The tool contains no prices.

## What is not
* It is not a survey and makes no survey-grade claim. Model accuracy is modest (held-out IoU 0.456, see `MODEL_AND_LICENSES.md`).
* **Roof pitch is never measured.** It is used only if the user enters it. A single top-down image does not contain it.
* Photogrammetry (multi-image 3D) is **not** part of this tool; several images are analysed independently.
* Individual roof planes, ridges, hips and valleys are not recognised by the model. Outline edges are *derived* from the mask; interior line segments are *unclassified candidates*; everything else is *undeterminable*, and the page says so.

## Scale workflows
| Workflow | Input | Result |
|---|---|---|
| Georeferenced | GeoTIFF with pixel size tags | metric, anisotropic if the tags say so |
| Known GSD | user-supplied ground sample distance | metric |
| Reference length | user draws one known length | metric for an orthographic top-down view (approximate if not) |
| Plane quad | user marks 4 corners of a known-size rectangle on the roof plane | homography: perspective-correct true plane area |
| No scale | nothing | **pixels only**; no metric value is shown |

## Sample data
`public/roof/samples/`: four unmodified SpaceNet 2 GeoTIFF chips (Las Vegas ×3, Paris ×1) from the held-out split, CC BY-SA 4.0, © DigitalGlobe, via SpaceNet. One is a known weak case (desert edge) and is labelled that way. Stored results beside them are a **recorded run** of the real service, labelled "precomputed" in the page.

See also `ARCHITECTURE.md`, `API.md`, `MEASUREMENT.md`, `MODEL_AND_LICENSES.md`, `LIMITATIONS.md`, `TESTING.md`, `DEPLOYMENT.md`.
