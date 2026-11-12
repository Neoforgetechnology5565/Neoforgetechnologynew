import { LANDING_PAGES } from "./landing-pages";

/** Short, original descriptions of the eight service areas for the main Services page. */
export const HUB_SHORT: Record<string, string> = {
  "computer-vision-development": "Custom software that finds, tracks and measures objects in images and video: detection, segmentation, inspection and real-time analytics.",
  "ai-development": "Machine learning and deep learning applications, predictive analytics, language and document processing, and AI added to your existing software.",
  "cctv-analytics": "AI video monitoring for people and vehicle counting, intrusion and PPE detection and event alerts, working with the cameras you already own.",
  "anpr-software": "Automatic number plate recognition systems for parking, gates and tolling: vehicle detection, plate reading, matching and integration.",
  "3d-reconstruction": "Photogrammetry, point cloud and LiDAR processing, meshing and 3D measurement software, with CAD and BIM output.",
  "cad-bim-development": "Revit plugins, AutoCAD automation, scan-to-BIM and engineering tools that take repetitive work out of design and documentation.",
  "crm-erp-development": "Custom CRM, ERP and HRM systems with workflow automation, reporting and integrations around how your business really runs.",
  "medical-imaging-ai": "Image processing, enhancement, segmentation and viewing software for research and workflow support. Not a diagnostic tool.",
};
export const HUB_ITEMS = LANDING_PAGES.map((p) => ({ ...p, short: HUB_SHORT[p.slug] }));

export const HUB_FAQS: { q: string; a: string }[] = [
  { q: "What software development services does NeoForge Technologies offer?", a: "We build AI and machine learning software, computer vision systems, CCTV analytics, ANPR software, 3D reconstruction tools, CAD and BIM plugins and applications, and custom CRM, ERP and HRM systems with workflow automation." },
  { q: "How do I choose the right service?", a: "Start with the problem. If it involves images or video, look at computer vision, CCTV analytics, ANPR or medical imaging. If it involves data and prediction, look at AI development. If it involves design software, look at CAD and BIM. If it involves running the business, look at CRM and ERP. If you are unsure, describe the problem and we will recommend an approach." },
  { q: "Do you build software for our existing systems?", a: "Yes. Most projects connect to systems you already use through APIs, plug-ins, webhooks or file exchange. We confirm what each system offers during discovery." },
  { q: "How does a project start?", a: "You describe the problem and send sample data or screenshots. We reply with what looks feasible, what we need to confirm and a proposed first step. A written proposal with scope, timeline and price comes before any commitment." },
  { q: "Who owns the software you build?", a: "Ownership and licensing are agreed in writing before work starts. Many clients take full ownership of the code written for them." },
  { q: "Can the software run on our own servers?", a: "Yes. We can build for your own servers, private cloud or edge devices, so sensitive data and video do not have to leave your environment." },
];

/** Which of the eight hub pages each existing /services/[slug] page belongs to (for the "part of" link). */
export const HUB_FOR_SERVICE: Record<string, string> = {
  "computer-vision-development": "computer-vision-development", "object-detection-development": "computer-vision-development", "object-tracking-development": "computer-vision-development", "ai-quality-inspection": "computer-vision-development", "ocr-document-processing": "computer-vision-development", "edge-ai-development": "computer-vision-development",
  "video-analytics-software": "cctv-analytics",
  "machine-learning-development": "ai-development", "deep-learning-development": "ai-development", "ai-automation-for-business": "ai-development", "ai-agent-development": "ai-development",
  "revit-plugin-development": "cad-bim-development", "autocad-plugin-development": "cad-bim-development", "sketchup-extension-development": "cad-bim-development", "sketchup-dynamic-components-development": "cad-bim-development", "bricscad-plugin-development": "cad-bim-development", "cad-automation-software": "cad-bim-development", "engineering-software-development": "cad-bim-development", "ifc-data-validation-tool": "cad-bim-development",
  "custom-crm-development": "crm-erp-development", "erp-software-development": "crm-erp-development", "hrm-software-development": "crm-erp-development", "business-process-automation": "crm-erp-development", "business-intelligence-dashboards": "crm-erp-development",
};
