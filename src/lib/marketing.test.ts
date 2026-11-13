import assert from "node:assert/strict";
import { contactKind, validId } from "./marketing";

async function main() {
  assert.ok(validId.gtm("GTM-ABC1234") && !validId.gtm("GTM-") && !validId.gtm("GTM-A\"><script>"));
  assert.ok(validId.ga4("G-ABCDE12345") && !validId.ga4("UA-123") && !validId.ga4("G-1 2"));
  assert.ok(validId.ads("AW-1234567890") && !validId.ads("AW-abc")); assert.ok(validId.adsLabel("AbC_123-xyz") && !validId.adsLabel("a b"));
  assert.ok(validId.clarity("abcd1234ef") && !validId.clarity("../x"));
  assert.equal(contactKind("mailto:hello@example.com"), "email"); assert.equal(contactKind("tel:+2348012345678"), "phone"); assert.equal(contactKind("TEL:+1"), "phone");
  assert.equal(contactKind("https://wa.me/2348012345678?text=Hi"), "whatsapp"); assert.equal(contactKind("https://api.whatsapp.com/send?phone=1"), "whatsapp");
  assert.equal(contactKind("/contact"), null); assert.equal(contactKind("https://example.com/wa.me"), null); assert.equal(contactKind("https://wa.me.evil.com/x"), null);
  console.log("marketing tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
