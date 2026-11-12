/**
 * Meeting scheduling maths. Pure functions (no Firestore, no network) so they can be unit tested.
 * Everything is stored as UTC milliseconds; time zones are IANA names and only used to display and to build
 * the company's working-hours slots. Offsets come from Intl, so daylight-saving rules are the platform's, not ours.
 */
export interface MeetingSettings {
  enabled: boolean;
  /** IANA zone of the team, e.g. "Europe/London". Slots are the team's working hours in this zone. */
  tz: string;
  /** Working hours in that zone, whole hours, start inclusive / end exclusive */
  startHour: number; endHour: number;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  durationMin: 30 | 45 | 60;
  /** How many calendar days (in the team's zone) to offer, starting tomorrow-ish */
  horizonDays: number;
  /** Minimum notice before a slot can be requested */
  leadHours: number;
  /** Optional external booking page (Calendly, Cal.com …). Shown as an extra option only when set. */
  bookingUrl: string;
}
export const MEETING_DEFAULTS: MeetingSettings = { enabled: true, tz: "UTC", startHour: 9, endHour: 17, days: [1, 2, 3, 4, 5], durationMin: 30, horizonDays: 14, leadHours: 24, bookingUrl: "" };
export const MEETING_PURPOSES = ["Project discovery call", "Request a quotation", "Technical consultation", "Demo walkthrough", "Other"] as const;

export const validZone = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

type Parts = { y: number; mo: number; d: number; h: number; mi: number; wd: number };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Wall-clock parts of an instant in a zone. */
export function partsIn(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const o: Record<string, string> = {}; for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: WD.indexOf(o.weekday) };
}
/** UTC offset (ms) of a zone at an instant. */
export function offsetAt(ms: number, tz: string): number {
  const p = partsIn(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000;
}
/**
 * Wall-clock time in a zone -> UTC ms. Returns null when that wall time does not exist (spring-forward gap).
 * When it happens twice (autumn overlap) the earlier instant is returned.
 */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number | null {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const cands = new Set<number>();
  for (const off of new Set([offsetAt(guess - 864e5, tz), offsetAt(guess + 864e5, tz), offsetAt(guess, tz)])) cands.add(guess - off);
  const ok = [...cands].filter((u) => { const p = partsIn(u, tz); return p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi; }).sort((a, b) => a - b);
  return ok.length ? ok[0] : null;
}

/** All bookable start times (UTC ms) for the settings, after `now`, minus the ones in `taken`. */
export function generateSlots(s: MeetingSettings, now: number, taken: ReadonlySet<number> = new Set()): number[] {
  const out: number[] = [], earliest = now + s.leadHours * 3600_000;
  const today = partsIn(now, s.tz);
  for (let i = 0; i <= s.horizonDays + 1; i++) {
    const day = new Date(Date.UTC(today.y, today.mo - 1, today.d + i)); // calendar arithmetic in UTC avoids DST in the loop
    if (!s.days.includes(day.getUTCDay())) continue;
    for (let mins = s.startHour * 60; mins + s.durationMin <= s.endHour * 60; mins += s.durationMin) {
      const u = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(mins / 60), mins % 60, s.tz);
      if (u !== null && u >= earliest && !taken.has(u)) out.push(u);
    }
  }
  return out;
}
export const isOfferedSlot = (s: MeetingSettings, now: number, start: number, taken: ReadonlySet<number> = new Set()) => generateSlots(s, now, taken).includes(start);

/** "Tue 14 Oct, 14:30 GMT+1" — the zone label comes from Intl so it is the abbreviation people know where one exists. */
export function formatSlot(ms: number, tz: string, withDate = true): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}), hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(ms);
}
/** Day heading key (YYYY-MM-DD) of an instant in a zone, for grouping slots in the visitor's own zone. */
export function dayKey(ms: number, tz: string): string { const p = partsIn(ms, tz); return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; }
