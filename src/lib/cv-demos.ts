/** Computer Vision & AI demo catalogue. Demos are delivered one at a time; only live ones have an app. */
export interface CvDemo { slug: string; no: string; title: string; problem: string; tags: string[]; features: string[]; status: "live" | "soon"; honest: string }

export const CV_DISCLAIMER = "Demonstrations use fictional, synthetic or user-supplied footage. Each demo states exactly what it runs (real model inference, reference annotations or simulation). They do not represent a completed client deployment.";

export const CV_DEMOS: CvDemo[] = [
  { slug: "ai-cctv-intelligence-security-analytics", no: "01", status: "live", title: "AI CCTV Intelligence & Security Analytics Platform",
    problem: "Security teams cannot watch every camera. Detection, tracking and rule-based events turn hours of footage into a reviewable timeline.",
    tags: ["Object detection", "Multi-object tracking", "Zone & line analytics", "Next.js API", "TensorFlow.js"],
    features: ["Upload a clip or open a sample, then play, seek and step frame by frame", "Real object detection on your upload (people, cars, trucks, buses, motorcycles, bicycles) with tracking IDs drawn on the video", "Draw restricted zones and virtual lines; get zone-entry, dwell and line-crossing events", "Event timeline with filters, click-to-seek, and a human confirm / dismiss review workflow", "Frame-level detections kept separate from unique tracked objects", "Analytics from real results; export events as CSV and the full analysis as JSON"],
    honest: "Inference runs in your browser (CPU/WebGL) or in an optional Node worker. It is not real-time, not GPU-accelerated on the server and does not connect to live cameras. Weapon detection is not supported." },
  ...[
    ["ai-factory-workforce-ppe-compliance", "AI Factory Workforce Monitoring & PPE Compliance", "Check workforce safety and PPE compliance from factory camera footage."],
    ["anpr-smart-parking-tolling", "ANPR, Smart Parking & Tolling", "Read plates and track vehicle flow for parking and toll operations."],
    ["ai-roof-measurement", "AI Roof Measurement", "Measure roof geometry from aerial and satellite imagery."],
    ["smart-glasses-spatial-mapping", "Smart Glasses Spatial Mapping", "Map spaces and place annotations from wearable-camera data."],
    ["sports-video-intelligence", "Sports Video Intelligence", "Track players and ball movement and derive match statistics."],
    ["ai-visual-inspection", "AI Visual Inspection", "Find surface defects and anomalies on manufactured parts."],
    ["lidar-point-cloud-wire-measurement", "LiDAR Point Cloud & Wire Measurement", "Classify point clouds and measure wires and clearances."],
    ["ai-human-activity-fall-aggression-detection", "AI Human Activity, Fall & Aggression Detection", "Flag falls and unusual activity for human review."],
    ["ai-document-intelligence-ocr", "AI Document Intelligence & OCR", "Extract structured data from scanned documents."],
  ].map(([slug, title, problem], i) => ({ slug, no: String(i + 2).padStart(2, "0"), status: "soon" as const, title, problem, tags: ["Computer vision"], features: [], honest: "Planned. Not built yet." })),
];
export const CV_MAP = Object.fromEntries(CV_DEMOS.map((d) => [d.slug, d]));
