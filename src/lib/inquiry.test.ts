import assert from "node:assert/strict";
import { contactSettingsSchema, inquirySchema } from "./schemas";
import { CONTACT_DEFAULTS } from "./defaults";
import { checkPhone } from "./phone";

const base = { name: "Anna Schmidt", email: "anna@example.de", country: "DE", message: "We need a computer vision pipeline for inspection." };
function bad(o: object, path: string) { const r = inquirySchema.safeParse({ ...base, ...o }); assert.ok(!r.success, `expected failure for ${path}`); assert.ok(r.error.issues.some((i) => i.path[0] === path), `issue on ${path}: ${JSON.stringify(r.error.issues)}`); }
async function main() {
  const ok = inquirySchema.parse({ ...base, service: "ANPR / licence plate recognition", phone: "030 123456", phoneCountry: "DE", budget: "$15k – $50k", preferredContact: "phone", intent: "quote" });
  assert.equal(ok.phoneE164, "+4930123456"); assert.equal(ok.currency, "USD"); assert.equal(ok.projectType, "Computer Vision"); assert.equal(ok.division, "computer-vision");
  assert.equal(inquirySchema.parse({ ...base, phone: "+1 415 555 2671" }).phoneE164, "+14155552671");
  assert.equal(inquirySchema.parse(base).phone, "");
  bad({ country: "ZZ" }, "country"); bad({ country: undefined }, "country");
  bad({ phone: "123", phoneCountry: "GB" }, "phone"); bad({ phone: "abc" }, "phone");
  bad({ preferredContact: "whatsapp" }, "phone"); // needs a number
  bad({ email: "nope" }, "email"); bad({ message: "short" }, "message");
  bad({ tz: "Not/A Zone!" }, "tz");
  assert.equal(inquirySchema.parse({ ...base, name: "<b>Bob</b>" }).name, "Bob");
  assert.equal(checkPhone("020 7946 0958", "GB")?.e164, "+442079460958");
  assert.equal(checkPhone("", "GB"), null);
  // WhatsApp links (wa.me) only work with a full international number
  const wa = (v: string) => contactSettingsSchema.safeParse({ ...CONTACT_DEFAULTS, whatsapp: v });
  assert.ok(wa("").success && wa("+234 801 234 5678").success && wa("+44 7700 900123").success);
  assert.equal((wa("+234 801 234 5678") as { data: { whatsapp: string } }).data.whatsapp, "2348012345678");
  assert.ok(!wa("08012345678").success, "local format with leading 0 breaks wa.me"); assert.ok(!wa("12345").success);
  console.log("inquiry schema tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
