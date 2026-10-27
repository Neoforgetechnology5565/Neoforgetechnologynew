import { seedHrm } from "./seed-hrm";
import { seedCrm } from "./seed-crm";
import { seedFin } from "./seed-fin";
import { seedPay } from "./seed-pay";
import { seedInv } from "./seed-inv";
import { seedProc } from "./seed-proc";
import { seedDesk } from "./seed-desk";
import { seedMkt } from "./seed-mkt";
import { seedProj } from "./seed-proj";
import { seedExec } from "./seed-exec";
import { audience, simulateMetrics } from "./mkt-calc";

export interface ActivityLog { id: string; at: string; demo: string; text: string }
/** Fresh copy of every slice: used for the initial state and for "reset". */
function mkt() {
  const m = seedMkt();
  for (const c of m.campaigns) if (c.status === "Sent (simulated)") { const a = audience(m.contacts, m.segments.find((s) => s.id === c.segmentId)); c.metrics = simulateMetrics(a.sendable.length, c.id); const at = c.scheduledFor.replace("T", " "); c.execution = [{ id: `${c.id}e1`, at, step: "Audience resolved", detail: `${a.members.length} contacts match the segment` }, { id: `${c.id}e2`, at, step: "Suppression applied", detail: `${a.suppressed} unsubscribed or bounced contacts excluded` }, { id: `${c.id}e3`, at, step: "Run completed (simulated)", detail: `${a.sendable.length} messages simulated. No email was actually sent.` }]; }
  return m;
}
export const SEEDS = () => ({
  hrm: seedHrm(),
  crm: seedCrm(),
  fin: seedFin(),
  pay: seedPay(),
  inv: seedInv(),
  proc: seedProc(),
  desk: seedDesk(),
  mkt: mkt(),
  proj: seedProj(),
  exec: seedExec(),
  activity: [] as ActivityLog[],
});
export type DB = ReturnType<typeof SEEDS>;
export type SliceKey = keyof DB;
