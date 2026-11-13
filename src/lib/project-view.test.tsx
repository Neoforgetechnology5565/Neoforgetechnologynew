import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import ProjectView from "../components/ProjectView";
import type { Project } from "./types";

const base: Project = { id: "1", title: "Gate ANPR", slug: "gate-anpr", division: "computer-vision", categoryId: "", categoryName: "", categorySlug: "", summary: "Plates at gates.", description: "d", cover: null, gallery: [], documents: [], files: [], videoUrl: "", videoLinks: [], video: null, technologies: ["Python"], features: [], challenge: "c", solution: "s", results: "r", pipeline: [], featured: false, status: "published", order: 0, createdAt: 0, updatedAt: 0 };
async function main() {
  const html = async (p: Partial<Project>) => renderToStaticMarkup(await ProjectView({ p: { ...base, ...p } }));
  const none = await html({}); assert.ok(!none.includes("project-kind") && !none.includes("not-client-note") && none.includes(">Results<"), "unlabelled projects claim nothing");
  const demo = await html({ kind: "demo", industry: "Logistics", objective: "Read plates reliably." });
  assert.ok(demo.includes("Internal demonstration") && demo.includes("Logistics") && demo.includes("Objective") && demo.includes("not from a client deployment"));
  const client = await html({ kind: "client" }); assert.ok(client.includes("Completed client project") && client.includes("Verified outcomes") && !client.includes("not-client-note"));
  const proto = await html({ kind: "prototype" }); assert.ok(proto.includes("Conceptual prototype") && proto.includes("has not been deployed for a client"));
  assert.ok(demo.includes("/anpr-software") && demo.includes("intent=quote#inquiry") && demo.includes("Related services"));
  assert.ok((await html({ division: "cad-bim" })).includes("/cad-bim-development"));
  console.log("project view tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
