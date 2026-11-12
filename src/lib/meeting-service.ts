import { generateSlots, type MeetingSettings } from "./meetings";
import type { MeetingRequest } from "./types";

/** Storage the service needs. The API route backs it with Firestore; tests use a fake. */
export interface MeetingStore {
  /** Start times (UTC ms) already requested or confirmed and not released */
  takenFrom(now: number): Promise<Set<number>>;
  /** Atomically claim a slot. False when someone else already holds it. */
  claim(start: number): Promise<boolean>;
  release(start: number): Promise<void>;
  add(doc: Omit<MeetingRequest, "id">): Promise<string>;
}
export type MeetingInput = Omit<MeetingRequest, "id" | "status" | "createdAt" | "durationMin" | "message" | "decidedAt">;
export class SlotError extends Error { constructor(public code: "not-offered" | "taken" | "disabled", msg: string) { super(msg); } }

/** Offered slots right now (the public list). */
export async function offeredSlots(store: MeetingStore, s: MeetingSettings, now: number): Promise<number[]> {
  if (!s.enabled) return [];
  return generateSlots(s, now, await store.takenFrom(now));
}

/** Creates a meeting *request*. It is not a booking: status stays "requested" until the team confirms by email. */
export async function requestMeeting(store: MeetingStore, s: MeetingSettings, input: MeetingInput, now: number): Promise<{ id: string; durationMin: number }> {
  if (!s.enabled) throw new SlotError("disabled", "Meeting requests are switched off right now. Please send an inquiry instead.");
  if (!generateSlots(s, now).includes(input.start)) throw new SlotError("not-offered", "That time is not available. Please choose another slot.");
  if (!(await store.claim(input.start))) throw new SlotError("taken", "Someone just requested that time. Please choose another slot.");
  try {
    const id = await store.add({ ...input, durationMin: s.durationMin, status: "requested", createdAt: now });
    return { id, durationMin: s.durationMin };
  } catch (e) { await store.release(input.start).catch(() => undefined); throw e; }
}
