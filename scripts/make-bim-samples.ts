/** Writes the bundled sample files to public/bim/samples (npx tsx scripts/make-bim-samples.ts). They are generated, synthetic, with known geometry. */
import { writeFileSync } from "node:fs";
import { SAMPLES } from "../src/lib/bim/samples-registry";
(async () => { const seen = new Set<string>(); for (const s of SAMPLES) for (const f of s.files) { if (seen.has(f.name)) continue; seen.add(f.name); const b = Buffer.from(await f.make()); writeFileSync(`public/bim/samples/${f.name}`, b); console.log("wrote", f.name, b.length); } })();
