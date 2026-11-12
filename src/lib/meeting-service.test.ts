import assert from "node:assert/strict";
import { offeredSlots, requestMeeting, SlotError, type MeetingStore } from "./meeting-service";
import { MEETING_DEFAULTS } from "./meetings";
import { meetingRequestSchema } from "./schemas";

function store(): MeetingStore & { docs: unknown[]; held: Set<number>; failAdd?: boolean } {
  const held = new Set<number>(), docs: unknown[] = [];
  const st: MeetingStore & { docs: unknown[]; held: Set<number>; failAdd?: boolean } = { held, docs,
    takenFrom: async () => new Set(held), claim: async (s) => { if (held.has(s)) return false; held.add(s); return true; }, release: async (s) => { held.delete(s); },
    add: async (d) => { if (st.failAdd) throw new Error("db down"); docs.push(d); return `m${docs.length}`; } };
  return st;
}
const S = { ...MEETING_DEFAULTS, tz: "Europe/London" }, now = Date.UTC(2026, 9, 12, 10);
const input = (start: number) => ({ name: "Anna", email: "a@b.de", company: "", country: "DE", phone: "", tz: "Europe/Berlin", start, purpose: "Request a quotation", notes: "" });
async function main() {
  const st = store(); const slots = await offeredSlots(st, S, now); assert.ok(slots.length > 20);
  const r = await requestMeeting(st, S, input(slots[0]), now); assert.equal(r.id, "m1");
  assert.equal((st.docs[0] as { status: string }).status, "requested"); // a request is never "confirmed" automatically
  assert.ok(!(await offeredSlots(st, S, now)).includes(slots[0])); // taken slot disappears
  await assert.rejects(requestMeeting(st, S, input(slots[0]), now), (e) => e instanceof SlotError && e.code === "taken");
  const st2 = store(); st2.held.add(slots[1]); // claimed between listing and request
  await assert.rejects(requestMeeting(st2, S, input(slots[1]), now), (e) => e instanceof SlotError && e.code === "taken");
  await assert.rejects(requestMeeting(st, S, input(now + 3600_000), now), (e) => e instanceof SlotError && e.code === "not-offered"); // inside lead time / off-grid
  await assert.rejects(requestMeeting(st, S, input(slots[0] + 1), now), (e) => e instanceof SlotError); // not a real slot
  await assert.rejects(requestMeeting(st, { ...S, enabled: false }, input(slots[2]), now), (e) => e instanceof SlotError && e.code === "disabled");
  const st3 = store(); st3.failAdd = true; await assert.rejects(requestMeeting(st3, S, input(slots[3]), now)); assert.equal(st3.held.size, 0); // slot released when saving fails
  // concurrent requests for one slot: exactly one wins
  const st4 = store(); const res = await Promise.allSettled([1, 2, 3, 4].map(() => requestMeeting(st4, S, input(slots[4]), now))); assert.equal(res.filter((x) => x.status === "fulfilled").length, 1);
  // schema
  const ok = meetingRequestSchema.parse({ ...input(slots[5]), phone: "+44 20 7946 0958" }); assert.equal(ok.phone, "+44 20 7946 0958");
  assert.ok(!meetingRequestSchema.safeParse({ ...input(slots[5]), tz: "Nope/Zone" }).success);
  assert.ok(!meetingRequestSchema.safeParse({ ...input(slots[5]), purpose: "Free money" }).success);
  assert.ok(!meetingRequestSchema.safeParse({ ...input(slots[5]), phone: "12", country: "GB" }).success);
  console.log("meeting service tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
