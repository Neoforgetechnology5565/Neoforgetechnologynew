/** Test-only helper: validate IFC bytes with ifcopenshell when Python and the package are available. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export function ifcValidate(buf: Buffer): "ok" | "skipped" | string {
  try { const d = mkdtempSync(join(tmpdir(), "ifc-")); const p = join(d, "m.ifc"); writeFileSync(p, buf); const out = execFileSync("python3", ["-I", "-c", "import ifcopenshell,sys\nf=ifcopenshell.open(sys.argv[1])\nprint(len(f.by_type('IfcProduct')))", p], { encoding: "utf8", timeout: 60000 }); return Number(out.trim()) > 0 ? "ok" : "no products"; } catch (e) { return /No module named|ENOENT/.test(String((e as Error).message) + String((e as { stderr?: string }).stderr)) ? "skipped" : "ifcopenshell failed to open the file"; }
}
