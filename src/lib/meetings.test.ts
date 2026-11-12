import assert from "node:assert/strict";
import { dayKey, formatSlot, generateSlots, MEETING_DEFAULTS, offsetAt, partsIn, validZone, zonedToUtc, type MeetingSettings } from "./meetings";

const H = 3600_000;
async function main() {
  // fixed offsets / known DST rules
  assert.equal(offsetAt(Date.UTC(2026, 0, 15, 12), "Europe/London"), 0);
  assert.equal(offsetAt(Date.UTC(2026, 6, 15, 12), "Europe/London"), H);
  assert.equal(offsetAt(Date.UTC(2026, 6, 15, 12), "America/New_York"), -4 * H);
  assert.equal(offsetAt(Date.UTC(2026, 0, 15, 12), "America/New_York"), -5 * H);
  assert.equal(offsetAt(Date.UTC(2026, 0, 15, 12), "Asia/Kolkata"), 5.5 * H);
  assert.equal(offsetAt(Date.UTC(2026, 0, 15, 12), "Africa/Lagos"), H);
  assert.equal(offsetAt(Date.UTC(2026, 0, 15, 12), "Australia/Sydney"), 11 * H);
  // wall time -> UTC round trip
  assert.equal(zonedToUtc(2026, 7, 15, 9, 0, "Europe/London"), Date.UTC(2026, 6, 15, 8));
  assert.equal(zonedToUtc(2026, 1, 15, 9, 0, "Europe/London"), Date.UTC(2026, 0, 15, 9));
  assert.equal(zonedToUtc(2026, 1, 15, 9, 0, "Asia/Kolkata"), Date.UTC(2026, 0, 15, 3, 30));
  // spring-forward gap: 2026-03-29 01:30 does not exist in London; 2026-03-08 02:30 does not exist in New York
  assert.equal(zonedToUtc(2026, 3, 29, 1, 30, "Europe/London"), null);
  assert.equal(zonedToUtc(2026, 3, 8, 2, 30, "America/New_York"), null);
  assert.equal(zonedToUtc(2026, 3, 29, 2, 0, "Europe/London"), Date.UTC(2026, 2, 29, 1)); // exists, BST
  // autumn overlap: 2026-10-25 01:30 happens twice in London; earlier (BST, UTC+1) is returned
  assert.equal(zonedToUtc(2026, 10, 25, 1, 30, "Europe/London"), Date.UTC(2026, 9, 25, 0, 30));
  // parts
  const p = partsIn(Date.UTC(2026, 0, 1, 23, 30), "Pacific/Auckland"); assert.deepEqual([p.d, p.h, p.mi], [2, 12, 30]);
  assert.equal(partsIn(Date.UTC(2026, 0, 1, 0, 0), "UTC").h, 0); // midnight must be 0, not 24
  assert.equal(dayKey(Date.UTC(2026, 0, 1, 23, 30), "Pacific/Auckland"), "2026-01-02");
  // slots: London team, Mon–Fri 09–17, 30 min, 24 h notice
  const s: MeetingSettings = { ...MEETING_DEFAULTS, tz: "Europe/London", days: [1, 2, 3, 4, 5], durationMin: 30, horizonDays: 14, leadHours: 24 };
  const now = Date.UTC(2026, 9, 12, 10, 0); // Mon 12 Oct 2026
  const slots = generateSlots(s, now);
  assert.ok(slots.length > 0);
  for (const u of slots) { const q = partsIn(u, "Europe/London"); assert.ok([1, 2, 3, 4, 5].includes(q.wd), "weekday"); assert.ok(q.h * 60 + q.mi >= 540 && q.h * 60 + q.mi <= 990, "hours"); assert.ok(u >= now + 24 * H, "lead time"); }
  assert.equal(new Set(slots).size, slots.length); assert.deepEqual([...slots].sort((a, b) => a - b), slots);
  // 16 slots a full day; the day after clocks go back (25 Oct) is still 16 slots and every slot is at the right local time
  const oct25 = slots.filter((u) => dayKey(u, "Europe/London") === "2026-10-26"); assert.equal(oct25.length, 16);
  assert.equal(formatSlot(oct25[0], "Europe/London").includes("09:00"), true);
  // taken slots are removed
  const t = new Set([slots[0]]); assert.ok(!generateSlots(s, now, t).includes(slots[0])); assert.equal(generateSlots(s, now, t).length, slots.length - 1);
  // DST-gap day never yields a nonexistent time: New York team on 2026-03-08 with a 02:00–04:00 window
  const ny: MeetingSettings = { ...s, tz: "America/New_York", days: [0], startHour: 1, endHour: 4, durationMin: 30, horizonDays: 3, leadHours: 0 };
  const gap = generateSlots(ny, Date.UTC(2026, 2, 6, 12)); const local = gap.map((u) => { const q = partsIn(u, "America/New_York"); return `${q.d} ${q.h}:${q.mi}`; });
  assert.ok(!local.includes("8 2:0") && !local.includes("8 2:30"), `gap slots leaked: ${local}`); assert.ok(local.includes("8 1:0") && local.includes("8 3:0"));
  // same instant displayed for visitor and team
  const slot = Date.UTC(2026, 9, 14, 13, 0);
  assert.match(formatSlot(slot, "America/Los_Angeles"), /06:00/); assert.match(formatSlot(slot, "Asia/Tokyo"), /22:00/); assert.match(formatSlot(slot, "Europe/London"), /14:00/);
  assert.ok(validZone("Africa/Lagos")); assert.ok(!validZone("Mars/Base"));
  console.log("meetings tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
