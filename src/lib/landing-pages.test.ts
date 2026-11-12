import assert from "node:assert/strict";
import { SUITE } from "./bim/suite";
import { CV_DEMOS } from "./cv-demos";
import { DEMOS } from "./demos";
import { ERP_DEMOS } from "./erp-demos";
import { LANDING_MAP, LANDING_PAGES } from "./landing-pages";
import { SERVICE_MAP } from "./services";
import { HUB_FAQS, HUB_FOR_SERVICE, HUB_ITEMS, HUB_SHORT } from "./services-hub";

const REQUIRED: Record<string, string> = { "computer-vision-development": "Computer Vision Development Company", "ai-development": "AI Software Development", "cctv-analytics": "CCTV Analytics Software", "anpr-software": "ANPR Software Development", "3d-reconstruction": "3D Reconstruction Services", "cad-bim-development": "CAD and BIM Software Development", "crm-erp-development": "CRM and ERP Software Development", "medical-imaging-ai": "Medical Imaging AI Development" };
assert.deepEqual(LANDING_PAGES.map((p) => p.slug).sort(), Object.keys(REQUIRED).sort(), "exactly the eight required slugs");
const ROUTES = new Set([...DEMOS.map((d) => `/demos/${d.slug}`), ...ERP_DEMOS.map((d) => `/erp-demos/${d.slug}`), ...CV_DEMOS.map((d) => `/ai-demos/${d.slug}`), ...SUITE.map((d) => `/cad-bim-suite/${d.slug}`)]);
const text = (p: (typeof LANDING_PAGES)[number]) => JSON.stringify(p).replace(/[{}\[\]"]/g, " ");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const seen = new Set<string>();
for (const p of LANDING_PAGES) {
  const id = p.slug;
  assert.equal(p.primary, REQUIRED[p.slug], id + ": primary keyword");
  assert.ok(p.metaTitle.length >= 40 && p.metaTitle.length <= 62, `${id}: title ${p.metaTitle.length} chars`); assert.ok(p.metaTitle.toLowerCase().includes(p.primary.toLowerCase()), id + ": title has the primary keyword"); assert.ok(/NeoForge/.test(p.metaTitle), id + ": brand in title");
  assert.ok(p.metaDescription.length >= 120 && p.metaDescription.length <= 160, `${id}: description ${p.metaDescription.length} chars`); assert.ok(p.metaDescription.toLowerCase().includes(p.primary.toLowerCase().split(" ").slice(0, 2).join(" ")), id + ": description mentions the topic");
  assert.ok(p.h1.toLowerCase().includes(p.primary.toLowerCase()), id + ": H1 has the primary keyword"); assert.ok(p.h1.length <= 110, id + ": H1 length");
  assert.equal(p.keywords.length, 10, id + ": ten secondary keywords");
  assert.ok(p.capabilities.length >= 9 && p.capabilities.every((c) => c.title && c.text.length > 40 && c.tech && c.icon), id + ": capability cards");
  assert.ok(p.useCases.length >= 5 && p.tech.length >= 4 && p.faqs.length >= 6 && p.limits.points.length >= 4 && p.work.length >= 3, id + ": section sizes");
  assert.deepEqual(p.process.map((s) => s.title), ["Requirements and technical discovery", "Solution architecture", "Development", "Testing and validation", "Deployment and integration", "Support and improvement"], id + ": process");
  assert.ok(words(text(p)) >= 1100, `${id}: ${words(text(p))} words`);
  for (const w of p.work) assert.ok(ROUTES.has(w.href), `${id}: work link ${w.href} is a real demo page`);
  for (const s of p.relatedServices) assert.ok(SERVICE_MAP[s], `${id}: related service ${s} exists`);
  for (const k of [p.metaTitle, p.metaDescription, p.lead, p.overview.what]) { assert.ok(!seen.has(k), id + ": duplicate text " + k.slice(0, 40)); seen.add(k); }
  assert.equal(new Set(p.faqs.map((f) => f.q)).size, p.faqs.length, id + ": unique questions");
  // claims we will not make
  const t = text(p);
  assert.ok(!/\bguarantee[sd]?\b|\b100\s?%|\b9\d(\.\d)?\s?%|world.s (best|leading)|\bbest in class\b|\bindustry-leading\b|\bcertified\b/i.test(t.replace(/not certified accounting/gi, "")), id + ": no guarantees, accuracy percentages or superlatives");
  assert.ok(!/\b(trusted by|our clients include|case study results|increased .* by \d)/i.test(t), id + ": no invented clients or results");
  assert.ok(!/(?<!not )(?<!no )clinically (proven|validated)|diagnoses (disease|cancer|patients)|replaces (doctors|radiologists)/i.test(t), id + ": no clinical claims");
  assert.equal(HUB_SHORT[p.slug].length > 60, true, id + ": hub description"); assert.ok(HUB_ITEMS.some((h) => h.slug === p.slug));
}
// page-specific honesty
const T = (s: string) => text(LANDING_MAP[s]);
assert.ok(/does not diagnose disease/i.test(T("medical-imaging-ai")) && /not a diagnostic/i.test(T("medical-imaging-ai")) && /regulatory approval/i.test(T("medical-imaging-ai")) && /research, visualisation and image-processing/i.test(T("medical-imaging-ai")));
assert.ok(/do not claim universal camera compatibility/i.test(T("cctv-analytics")) && /RTSP/.test(T("cctv-analytics")) && /ONVIF where/.test(T("cctv-analytics")));
assert.ok(/image quality, camera placement/i.test(T("anpr-software")) && /lighting/i.test(T("anpr-software")) && /plate formats/i.test(T("anpr-software")) && /does not read plates/i.test(T("anpr-software")), "ANPR caveats, and no claim that the demo reads plates");
assert.ok(/cannot be run reliably entirely in a web browser/i.test(T("3d-reconstruction")) && /GPU/.test(T("3d-reconstruction")) && /COLMAP/.test(T("3d-reconstruction")) && /Open3D/.test(T("3d-reconstruction")) && /Three\.js/.test(T("3d-reconstruction")));
for (const [slug, words] of Object.entries({ "computer-vision-development": ["Python", "OpenCV", "YOLO", "PyTorch", "TensorFlow", "ONNX"], "ai-development": ["Python", "PyTorch", "TensorFlow", "scikit-learn", "FastAPI"], "cad-bim-development": ["Revit API", "Autodesk Platform Services", "AutoCAD", "IFC", "Python", ".NET"] })) for (const w of words) assert.ok(T(slug).includes(w), `${slug} mentions ${w}`);
// services hub: all eight, FAQs, and every existing service page maps to a real hub
assert.equal(HUB_ITEMS.length, 8); assert.ok(HUB_FAQS.length >= 5);
for (const [svc, hub] of Object.entries(HUB_FOR_SERVICE)) { assert.ok(SERVICE_MAP[svc], "service " + svc); assert.ok(LANDING_MAP[hub], "hub " + hub); }
console.log(`landing pages: all tests passed (${LANDING_PAGES.length} pages, ${LANDING_PAGES.reduce((n, p) => n + words(text(p)), 0)} words)`);
