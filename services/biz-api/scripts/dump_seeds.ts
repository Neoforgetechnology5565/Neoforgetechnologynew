// Dumps the front end's seed data to JSON so the API tests run against the real demo datasets.  npx tsx services/biz-api/scripts/dump_seeds.ts
import { writeFileSync } from "node:fs";
import { SEEDS } from "../../../src/lib/biz/seeds";
writeFileSync(new URL("../tests/seeds.json", import.meta.url), JSON.stringify(SEEDS()));
console.log("wrote tests/seeds.json");
