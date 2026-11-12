import assert from "node:assert/strict";
import { reviewSchema } from "./schemas";

const base = { name: "A B", quote: "A genuine quote here." };
const sample = reviewSchema.parse({ ...base, kind: "sample", rating: 5, source: "Fiverr", sourceUrl: "https://example.com" });
assert.deepEqual([sample.rating, sample.source, sample.sourceUrl], [0, "", ""], "sample drops stars, source and link");
assert.throws(() => reviewSchema.parse({ ...base, kind: "verified", rating: 5, source: "Upwork", evidence: "email" }), "verified needs permission");
assert.throws(() => reviewSchema.parse({ ...base, kind: "verified", permission: true }), "verified needs a link or proof note");
assert.equal(reviewSchema.parse({ ...base, kind: "verified", permission: true, evidence: "email 1 Mar", rating: 5, source: "Upwork" }).source, "Upwork");
console.log("review schema: 4 passed");
