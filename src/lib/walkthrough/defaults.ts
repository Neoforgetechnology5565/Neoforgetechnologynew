/**
 * Built-in walkthroughs. Every default is project-specific and was run against the real interface (scripts/test-walkthrough-all.mjs fails if a built-in step cannot find its element).
 * Administrators change subtitles, order and actions in Admin > Demo Walkthrough; saved edits override these defaults.
 * Steps only navigate, select samples, switch tabs and highlight. They never delete, send, pay or change records (see guard.ts).
 */
import type { DemoEntry, Quality, WtConfig } from "./schema";

import { P, a, cfg, ck, dd, go, hl, sc, smp, steps, tab, up, wt, type Raw } from "./dsl";
import { MORE, PARTIAL } from "./defaults-more";
void dd; void hl; void sc; void up; void steps; void a;

/* ------------------------------------------------------------------ computer vision */
const CV: Record<string, WtConfig> = {
  "cv-ai-cctv-intelligence-security-analytics": cfg("AI CCTV Intelligence & Security Analytics", "Welcome to the AI CCTV monitoring workspace. It turns recorded video into detections, counting lines, restricted zones and reviewable events.", "That completes the CCTV tour: sample clips, detections, events, analytics, settings, zones and exports.", [
    ["Where the results come from", "A banner always states whether the results are real inference on your own video or the prepared reference annotations that ship with the synthetic samples.", "tid:mode-banner", [], P],
    ["Choose a sample clip", "Two synthetic clips are bundled: a gate crossing and a restricted bay. They contain rendered shapes, not real people.", "btn:Gate crossing", [smp("btn:Gate crossing")], P],
    ["Frame-accurate playback", "Play, step frame by frame and seek anywhere in the clip, so a reviewer can stop on exactly the moment that matters.", "tid:seek", [ck("tid:next-frame")]],
    ["Detections drawn on the video", "Each detected object is drawn on the frame with its class and track, so the overlay can be checked against what is really visible.", "tid:overlay"],
    ["Filter by object class", "Show only the classes you care about, for example people or cars.", "tid:cls-person", [ck("tid:cls-car"), ck("tid:cls-car")]],
    ["Events", "Crossings and zone entries are listed as events, each linked to the moment in the video.", "tab:Events", [tab("tab:Events")]],
    ["Analytics", "Counts and trends are calculated from the detections for the clip.", "tab:Analytics", [tab("tab:Analytics")]],
    ["Settings", "Detection and tracking settings are adjustable and kept with the results.", "tab:Settings", [tab("tab:Settings")]],
    ["Zones and counting lines", "Draw a restricted zone or a counting line on the frame to turn raw detections into events.", "tid:draw-zone", [tab("tab:Detections")]],
    ["Exports", "Results can be exported as CSV or JSON for reporting.", "btn:Export CSV"],
  ]),
  "cv-ai-factory-workforce-ppe-compliance": cfg("Factory Workforce & PPE Monitoring", "This workspace detects workers in factory footage, checks protective equipment and reports compliance per person.", "That completes the PPE tour: sample, rules, zone, processing, overlays and views.", [
    ["Which engine will run", "The panel states which engine processes the video, so nobody mistakes a browser model for a hosted service.", "tid:engine-state"],
    ["Choose the sample footage", "A corridor clip with workers in hard hats and vests is bundled. You can also upload your own video.", "tid:sample-factory-corridor-ppe", [smp("tid:sample-factory-corridor-ppe")], P],
    ["Set the required equipment", "Choose which items count as required. Compliance is judged against exactly these rules.", "tid:require-hard_hat"],
    ["Monitoring zone", "Draw a zone so only workers inside it are assessed.", "tid:draw-zone"],
    ["Start processing", "Processing detects each worker, tracks them across frames and checks the equipment. The progress and status update live.", "tid:start"],
    ["Overlay options", "Switch the worker boxes, PPE boxes, track ids, confidences and compliance labels on and off.", "tid:toggle-workers", [ck("tid:toggle-ids"), ck("tid:toggle-ids")]],
    ["View modes", "Compare the original with the overlay, the annotated video, or both side by side.", "tab:Side by side", [tab("tab:Side by side"), tab("tab:Original + overlay")]],
  ]),
  "cv-vehicle-detection-tracking-counting": cfg("Vehicle Detection, Tracking & Counting", "This workspace detects and tracks vehicles in video and counts them as they cross a line you draw.", "That completes the vehicle tour: engine choice, sample, counting line, processing, overlays and views.", [
    ["Choose the engine", "The demo can use a hosted service or run entirely in the browser. The engine is chosen explicitly.", "tid:engine-browser"],
    ["Highway sample", "A dash-cam highway clip is bundled so the demo works without uploading anything.", "tid:sample-highway-dashcam", [smp("tid:sample-highway-dashcam")], P],
    ["Counting line", "Draw a line across the road. A vehicle is counted once when its track crosses it.", "tid:draw-line"],
    ["Start processing", "Detection and tracking run frame by frame; statistics update as they go.", "tid:start"],
    ["Overlay options", "Boxes, labels, confidences and track ids can each be switched on or off.", "tid:toggle-boxes", [ck("tid:toggle-labels"), ck("tid:toggle-labels")]],
    ["Three ways to view the result", "Overlay on the original, the processed video, or side by side.", "tab:Side by side", [tab("tab:Side by side"), tab("tab:Overlay on original")]],
  ]),
  "cv-ai-roof-measurement": cfg("AI Roof Measurement & Estimation", "This workspace segments roofs in aerial imagery, measures their area and pitch, and prices the work from your own rates.", "That completes the roof tour: samples, scale, analysis, regions, tools and the report.", [
    ["Aerial samples", "Four aerial images are bundled, from suburban streets to large flat roofs.", "tid:sample-vegas-subdivision", [smp("tid:sample-vegas-subdivision")], P],
    ["How the scale is known", "Area depends on scale. Choose georeferenced, calibrated by a known length, or no scale (pixels only).", "tid:wf-georeferenced"],
    ["Units and pitch", "Set the unit, the pitch convention and the roof type used in the measurement.", "tid:unit"],
    ["Run the analysis", "A segmentation model finds roof regions; each is measured and listed. In the browser this takes about a minute, so the tour waits for the first results.", "tid:start", [ck("tid:start"), wt("tid:region-row", 120000)], { durationMs: 3000 }],
    ["Region list", "Each region has its area, pitch and edges, and can be reviewed one by one.", "tid:region-row"],
    ["Measurement tools", "Inspect, trace an outline by hand, set a reference length or calibrate a plane when the model needs help.", "tid:tool-trace"],
    ["Layers", "Switch the roof mask, outlines, edges and probability layers on and off.", "tid:layer-outlines"],
  ]),
  "cv-ai-medical-imaging-analysis": cfg("Medical Imaging AI & Analysis", "This workspace enhances and segments PNG and JPEG biomedical images and measures what it finds. It does not diagnose, and it states that on screen.", "That completes the medical imaging tour: samples, enhancement, segmentation and measurements.", [
    ["What this is and is not", "A notice states the scope: image processing and measurement only, with no diagnosis and no abnormality labels.", "tid:notice"],
    ["Open a public-domain sample", "Five images with a clear source are bundled, including a retinal photograph and a histology slide.", "tid:sample-fundus", [smp("tid:sample-fundus")], P],
    ["Enhancement controls", "Adjust contrast, denoising and inversion and compare the result with the original.", "tid:contrast", [], {}],
    ["Segmentation", "Choose a segmentation method and threshold; each region is outlined and measured.", "tid:seg"],
    ["Side by side and swipe", "Compare original and processed images side by side or with a swipe slider.", "tid:layout-swipe"],
    ["Operations log and provenance", "Every operation applied to the image is logged, and the image's source and licence stay visible, so nothing is presented without its origin.", "tid:ops-list"],
    ["Another modality", "Switch to a histology sample to see the same tools on a different kind of image.", "tid:sample-histology-he", [smp("tid:sample-histology-he")], P],
  ]),
  "cv-sports-video-intelligence": cfg("Sports Video Intelligence", "This workspace tracks players and the ball in match video and turns the tracks into positions, trajectories, heat maps and statistics.", "That completes the sports analytics tour: video, analysis options, views and calibration.", [
    ["Service state", "The panel says which engine will run the analysis: the hosted service or the in-browser engine.", "tid:service-state"],
    ["Bundled footage", "A match clip is bundled so the analysis can run without an upload.", "tid:samples", [], P],
    ["Choose the range and sampling", "Pick a start and end time and a sampling rate; longer ranges take longer.", "tid:p-start"],
    ["Analyse the video", "Players and the ball are detected and tracked through the range.", "tid:start"],
    ["Overlay options", "Boxes, track ids, confidences, the ball and its trail can be shown or hidden.", "tid:ov-boxes"],
    ["Positions", "The positions view lists every tracked player over time.", "tab:Positions", [tab("tab:Positions")]],
    ["Trajectories", "Trajectories show where each player moved.", "tab:Trajectories", [tab("tab:Trajectories")]],
    ["Heat map", "The heat map shows where activity concentrated.", "tab:Heatmap", [tab("tab:Heatmap")]],
    ["Zones", "Zones summarise time spent in areas of the pitch.", "tab:Zones", [tab("tab:Zones")]],
    ["Pitch calibration", "Calibration maps the image to pitch coordinates so distances can be meaningful.", "btn:Calibrate pitch"],
  ]),
  "cv-ai-visual-inspection": cfg("AI Visual Inspection & Defect Detection", "This workspace compares parts against a reference of good parts and highlights where they differ, with a human decision at the end.", "That completes the inspection tour: references, gallery, rules and review.", [
    ["Pick a reference", "Anomaly detection learns from good parts. Choose a bundled reference or build one from your own images.", "tid:ref-select"],
    ["Reference information", "The panel shows how the reference was built and how it scored on held-out parts.", "tid:ref-info"],
    ["Part gallery", "Bundled parts include good samples and samples with annotated anomalies.", "tid:gallery", [tab("tab:Part gallery")], P],
    ["Decision rules", "Thresholds and region limits decide whether a part passes, needs review or fails.", "tid:rules"],
    ["Inspection history", "Every inspection is kept with who reviewed it and what they decided.", "tab:History", [tab("tab:History")]],
  ]),
  "cv-ai-animal-detection-smart-farming": cfg("Animal Detection & Monitoring for Smart Farming", "This workspace detects animals in farm images and video, counts them, and flags animals entering a crop-protection zone you draw.", "That completes the smart farming tour: supported animals, sample, zone, detection and results.", [
    ["Scope notice", "A notice lists the animal classes the model supports and states that there is no live camera feed.", "tid:notice"],
    ["Bundled sample", "A public-domain photograph is bundled; you can also upload a farm image or video.", "tid:sample-chelsea", [smp("tid:sample-chelsea")], P],
    ["Crop-protection zone", "Draw a polygon around the area to protect. Animals entering it are reported as events.", "tid:zone-draw"],
    ["Detection confidence", "The confidence threshold sets how sure the model must be before an animal is counted.", "tid:conf"],
    ["Detect animals", "The detector runs in the browser and counts each supported animal.", "tid:run", [ck("tid:run"), wt("tid:results", 30000)]],
    ["Results", "Counts by class, zone events and the annotated stage are available, with exports.", "tid:results"],
  ]),
  "cv-ai-human-activity-fall-aggression-detection": cfg("Human Activity, Fall & Aggression Review", "This workspace finds candidate moments in video where a person falls or movement looks aggressive, and queues them for human review. It never decides on its own.", "That completes the activity review tour: sample, range, sensitivity, processing and review.", [
    ["Scope notice", "The notice explains that results are candidates for a person to review, not findings.", "tid:notice"],
    ["Open the bundled sample", "A pedestrian clip is bundled for the demonstration.", "tid:open-sample", [smp("tid:open-sample")], P],
    ["Choose the range", "Set the start and end time to analyse only the part you need.", "tid:start-s"],
    ["Sensitivity presets", "Default or high sensitivity changes how many candidates are raised.", "tid:preset-default", [ck("tid:preset-sensitive"), ck("tid:preset-default")]],
    ["Process the video", "People are detected, tracked and their poses analysed; rules raise alerts.", "tid:process"],
    ["Review queue", "Every alert goes to a queue where a reviewer confirms or dismisses it.", "tid:queue"],
  ]),
  "cv-ai-document-intelligence-ocr": cfg("Document Intelligence & OCR", "This workspace reads PDFs and scans, extracts fields, text and tables, and lets a person confirm or correct every value.", "That completes the document intelligence tour: samples, reading, fields, text, tables and summary.", [
    ["Scope notice", "The notice explains what is read automatically and what a person must confirm.", "tid:notice"],
    ["Open a sample document", "Bundled documents include a text invoice, a scanned invoice and a stock report.", "tid:sample-invoice-text", [smp("tid:sample-invoice-text")], P],
    ["Reading mode", "Choose between the PDF text layer and OCR for scans.", "tid:opt-mode"],
    ["Read the document", "The page is read, laid out and fields are extracted with their source and position.", "tid:process", [ck("tid:process"), wt("tab:Fields", 30000)]],
    ["Fields", "Each field shows its value, rule, page and a flag when it needs checking.", "tab:Fields", [tab("tab:Fields")]],
    ["Text", "The full text with line positions is available.", "tab:Text", [tab("tab:Text")]],
    ["Tables", "Ruled tables are read into cells and can be exported.", "tab:Tables", [tab("tab:Tables")]],
    ["Summary", "The summary lists the document type and any arithmetic checks.", "tab:Summary", [tab("tab:Summary")]],
  ]),
  "cv-ai-shoe-foot-measurement-fitting": cfg("AI Shoe & Foot Measurement and Fitting", "This workspace measures a foot from a photo or scan and recommends a shoe size, with a 3D view of the result.", "That completes the foot measurement tour: capture options, the sample result and the 3D view.", [
    ["Three ways to start", "Measure with the phone camera, upload an existing scan, or try the bundled sample data.", "btn:Start Foot Measurement"],
    ["Try with sample data", "The sample runs the full pipeline on a bundled image, so nothing needs to be uploaded.", "btn:Try with sample data", [smp("btn:Try with sample data")], P],
    ["3D view", "The measured outline is shown in 3D with front, side and top views.", "btn:Top", [], {}],
    ["Printer scale check", "A printable sheet lets you check that the scale of a photo is right.", "btn:Open printer scale-check sheet"],
  ]),
  "cv-ai-restaurant-employee-monitoring": cfg("Restaurant Area-Presence Review", "This workspace turns restaurant video into a list of when people entered and left an area you define, for a manager to check. It is not a verdict on anyone.", "That completes the restaurant review tour across its sections.", [
    ["Overview", "The overview explains what is measured and what is not, and links to each stage.", "tid:feature-list", [go("nav:Overview")]],
    ["Video analysis", "Start with a recorded video; people are detected and tracked.", "btn:Start with a video"],
    ["Area monitoring", "Draw the areas to monitor, such as a kitchen or a staff room.", "nav:Area Monitoring", [go("nav:Area Monitoring")]],
    ["Attendance comparison", "Detected presence is compared with a manually entered schedule, using fictional data.", "nav:Attendance Comparison", [go("nav:Attendance Comparison")]],
    ["Reports and evidence", "Events link to evidence clips, and reports can be exported.", "nav:Reports & Evidence", [go("nav:Reports & Evidence")]],
    ["Settings", "Thresholds and the service connection are configured here.", "nav:Settings", [go("nav:Settings")]],
  ]),
  "cv-ai-table-tennis-video-intelligence": cfg("Table Tennis Video Intelligence", "This workspace analyses recorded table tennis video: calibrating the table, following the ball and rallies, and listing players' actions.", "That completes the table tennis tour across its sections.", [
    ["Overview", "The overview explains what is measured and what needs manual annotation.", "tid:feature-list", [go("nav:Overview")]],
    ["Video analysis", "Start with a recorded rally.", "btn:Start with a video"],
    ["Table calibration", "Mark the table corners so ball positions can be located on the table.", "nav:Table Calibration", [go("nav:Table Calibration")]],
    ["Ball and rallies", "The ball track is split into rallies.", "nav:Ball & Rallies", [go("nav:Ball & Rallies")]],
    ["Players", "Player positions and movement are summarised.", "nav:Players", [go("nav:Players")]],
    ["Manual annotation", "Some events, such as the type of stroke, are marked by a person.", "nav:Manual Annotation", [go("nav:Manual Annotation")]],
    ["Reports", "Results can be exported as reports.", "nav:Reports", [go("nav:Reports")]],
  ]),
  "cv-ai-basketball-video-intelligence": cfg("Basketball Video Intelligence", "This workspace analyses recorded basketball video: mapping the court, following players and the ball, and producing heat maps.", "That completes the basketball tour across its sections.", [
    ["Overview", "The overview explains what is measured and what needs manual annotation.", "tid:feature-list", [go("nav:Overview")]],
    ["Video analysis", "Start with a recorded game.", "btn:Start with a video"],
    ["Court mapping", "Mark court points so positions map onto the court.", "nav:Court Mapping", [go("nav:Court Mapping")]],
    ["Players and heat map", "Player tracks become a heat map of where play happened.", "nav:Players & Heatmap", [go("nav:Players & Heatmap")]],
    ["Ball and possession", "The ball track is used to estimate possession.", "nav:Ball & Possession", [go("nav:Ball & Possession")]],
    ["Manual annotation", "Shots and fouls are marked by a person.", "nav:Manual Annotation", [go("nav:Manual Annotation")]],
    ["Reports", "Results can be exported as reports.", "nav:Reports", [go("nav:Reports")]],
  ]),
};
const ml = (title: string, intro: string, completion: string, sample: string, resultSel: string, t: [scope: string, sample: string, run: string, result: string], extra: Raw[] = []) => cfg(title, intro, completion, [
  ["Scope notice", t[0], "tid:notice"],
  ["Choose a bundled sample", t[1], `tid:${sample}`, [smp(`tid:${sample}`)], P],
  ["Run it in the browser", t[2], "tid:result", [wt(resultSel, 60000)]],
  ["The result", t[3], resultSel],
  ...extra,
]);
const ML: Record<string, WtConfig> = {
  "cv-ai-image-classification": ml("AI Image Classification & Recognition", "This workspace labels what an image shows with a real pretrained model and shows every score it assigns.", "That completes the classification tour.", "sample-astronaut", "tid:predictions", [
    "A notice names the pretrained classifier, the 1,000 everyday categories it knows and what it cannot recognise.", "Five bundled photographs are offered: an astronaut, a cat, a coffee cup, a rocket and a street scene.", "MobileNetV2 runs inside the page. The first run downloads the model file; later runs are instant.", "The top predictions are listed with their probabilities, so you can see when the model is unsure."]),
  "cv-ai-object-detection-video-analytics": ml("AI Object Detection & Video Analytics", "This workspace detects and counts everyday objects in images and video with boxes, classes and confidences.", "That completes the object detection tour.", "sample-street", "tid:result", [
    "A notice states the detector (YOLOX), the 80 object classes it knows and its limits.", "Pick a still image or an eight-second pedestrian clip. Both are bundled with a stated source.", "The detector runs frame by frame in the browser; video results build up as frames are processed.", "Boxes are drawn on the media and counted by class in a table."], [["Detection threshold", "Raise or lower the confidence threshold to trade missed objects against false ones.", "tid:threshold"]]),
  "cv-ai-image-segmentation": ml("AI Image Segmentation & Scene Understanding", "This workspace colours every pixel of a scene by what the model thinks it is.", "That completes the segmentation tour.", "sample-street", "tid:result", [
    "A notice names the segmentation model (DeepLabV3) and the classes it can separate.", "Choose one of five bundled photographs; a street scene shows many classes at once.", "The model labels every pixel. The mask is computed in the page and can be exported.", "The mask is laid over the photo and a legend lists each class with its share of the image."]),
  "cv-ai-ocr-document-extraction": ml("OCR & Intelligent Document Extraction", "This workspace reads text from PDFs and scans and pulls out simple fields.", "That completes the OCR tour.", "sample-invoice-text", "tid:result", [
    "A notice explains when the PDF's own text is used and when OCR is needed.", "Bundled documents include a text invoice, a scanned invoice and a photographed test page.", "Text is taken from the PDF or recognised from the image, then fields are found with explicit rules.", "Lines are boxed on the page and fields are listed with the rule that found each one."], [["Force OCR", "Tick this to skip the PDF text layer and read the page image instead.", "tid:force-ocr"]]),
  "cv-ai-image-anomaly-detection": ml("AI Image Anomaly & Defect Detection", "This workspace scores how unusual a manufactured part looks and shows where.", "That completes the anomaly detection tour.", "sample-candle-anomalous-1", "tid:result", [
    "A notice explains that the model learns only from good parts, and what that means for new kinds of defect.", "Bundled candle samples include good parts and parts with an annotated anomaly.", "PatchCore-style features are compared with the reference of good parts, in the browser.", "An anomaly score and a heat map show how far, and where, the part differs from normal."], [["Reference and threshold", "The reference of good parts and the threshold decide what counts as anomalous.", "tid:ref-select"]]),
  "cv-ai-time-series-forecasting": ml("Time-Series Forecasting & Predictive Analytics", "This workspace shows a series and forecasts it with transparent methods and hold-out validation.", "That completes the forecasting tour.", "sample-co2-monthly", "tid:result", [
    "A notice explains that the methods are classical and transparent, with their assumptions.", "A real monthly carbon-dioxide series is bundled; you can also upload your own CSV.", "Several methods, including Holt-Winters, forecast the series and are scored on data they did not see.", "History and forecast are drawn together, with the error of each method so the best one is not chosen by eye."]),
  "cv-ai-predictive-maintenance": ml("Predictive Maintenance & Sensor Anomaly Detection", "This workspace finds unusual behaviour in machine sensor readings.", "That completes the predictive maintenance tour.", "sample-pump-sensors-synthetic", "tid:result", [
    "A notice states that the sensor data is synthetic and how the anomaly methods work.", "A synthetic pump dataset with known faults is bundled; you can also upload a CSV.", "Methods such as Isolation Forest score each reading in the browser.", "Flagged points are marked on each sensor trace and compared across methods."]),
  "cv-ai-human-pose-estimation": ml("Human Pose Estimation & Activity Recognition", "This workspace locates people and their body joints in images and video.", "That completes the pose estimation tour.", "sample-street", "tid:result", [
    "A notice states the models used for finding people and joints, and their limits.", "Choose a bundled photograph or an eight-second pedestrian clip.", "People are found first, then 33 body landmarks are estimated for each, entirely in the page.", "Skeletons are drawn on the media and the keypoints are listed with their confidence."]),
  "cv-ai-semantic-document-search": cfg("Semantic Document Search & Embeddings", "This workspace searches your own documents by meaning as well as by keyword.", "That completes the semantic search tour.", [
    ["Scope notice", "A notice explains how embeddings are computed in the browser and what search can and cannot do.", "tid:notice"],
    ["Bundled documents", "Short documents describing the other demos are bundled so there is something to search.", "tid:sample-docs-activity-rules", [smp("tid:sample-docs-activity-rules")], P],
    ["Add your own text", "Paste text to add it to the index. Nothing leaves the browser.", "tid:paste"],
    ["Search modes", "Choose keyword matching or semantic matching and compare what each finds.", "tid:mode-semantic"],
    ["Ranked results", "Matching passages are ranked with highlights and the score that ranked them.", "tid:result"],
  ]),
  "cv-ai-product-recommendation": cfg("Product Recommendation & Similarity Search", "This workspace finds products similar to the one you are looking at, and shows why.", "That completes the recommendation tour.", [
    ["Scope notice", "A notice explains what similarity is based on and how the catalogue was built.", "tid:notice"],
    ["Search the catalogue", "Search by name to narrow the catalogue of real product images.", "tid:search"],
    ["Filter by category", "Narrow the catalogue by category.", "tid:category"],
    ["Select a product", "Pick a product to see similar items ranked with their scores and the reason for the match.", "tid:result"],
  ]),
};
Object.assign(CV, ML);
CV["cv-ai-semantic-document-search"] = ML["cv-ai-semantic-document-search"];

export const BUILTIN: Record<string, WtConfig> = { ...CV, ...MORE };

/** Generated when a demo has no hand-written walkthrough yet (for example a demo added later). Marked as a draft in the manager. */
export function draftConfig(d: DemoEntry): WtConfig {
  return cfg(d.title, d.summary, `That completes the ${d.title} walkthrough.`, [
    ["Introduction", d.summary, "h1, h2", [], {}],
    ...d.features.slice(0, 5).map((f, i): Raw => [`Feature ${i + 1}`, f.length > 380 ? f.slice(0, 377) + "…" : f, "main", [], {}]),
    ["What is real and what is sample data", d.honest.slice(0, 380), "main", [], P],
  ]);
}
export { PARTIAL };
export function configFor(d: DemoEntry): { config: WtConfig; quality: Quality } {
  const c = BUILTIN[d.key]; return c ? { config: structuredClone(c), quality: PARTIAL[d.key] !== undefined ? "partial" : "verified" } : { config: draftConfig(d), quality: "draft" };
}
