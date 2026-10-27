import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildResults } from "@/lib/foot/results";
import { RULESET } from "@/lib/foot/sizing";
import { HttpError, authorize, fail, limit, listCaptures, sameOrigin, sessionDTO } from "@/lib/foot/server";

export const runtime = "nodejs";
const schema = z.object({ fit: z.enum(["snug", "regular", "roomy"]).default("regular"), allowanceMm: z.number().min(0).max(35).optional(), profileId: z.string().max(40).optional() });
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req); limit(req, "reco", 120); const { session } = await authorize(req, (await params).id); const b = schema.parse(await req.json().catch(() => ({}))); const caps = await listCaptures(session.id);
    const r = buildResults(sessionDTO(session, caps.length), caps, b.fit, b.allowanceMm); if (!r.size) throw new HttpError(409, "Measure at least one foot first.");
    const recs = b.profileId ? r.recommendations.filter((x) => x.profile.id === b.profileId) : r.recommendations;
    return NextResponse.json({ size: r.size, width: r.width, fitFoot: r.fitFoot, recommendations: recs, ruleset: { id: RULESET.id, description: RULESET.description }, disclaimer: "Estimates from general conversion rules and sample style profiles, not a brand's official size chart and not a guarantee of fit. No stock is implied." });
  } catch (e) { return fail(e); }
}
