import { describe, it, expect } from "vitest";
import { reviewSchema } from "./schemas";
const base = { name: "A B", quote: "A genuine quote here." };
describe("reviewSchema", () => {
  it("sample drops stars, source and link", () => { const r = reviewSchema.parse({ ...base, kind: "sample", rating: 5, source: "Fiverr", sourceUrl: "https://x.com" }); expect([r.rating, r.source, r.sourceUrl]).toEqual([0, "", ""]); });
  it("verified without permission is rejected", () => { expect(() => reviewSchema.parse({ ...base, kind: "verified", rating: 5, source: "Upwork", evidence: "email" })).toThrow(); });
  it("verified without link or proof is rejected", () => { expect(() => reviewSchema.parse({ ...base, kind: "verified", permission: true })).toThrow(); });
  it("verified with permission and proof note is accepted", () => { expect(reviewSchema.parse({ ...base, kind: "verified", permission: true, evidence: "email 1 Mar", rating: 5, source: "Upwork" }).source).toBe("Upwork"); });
});
