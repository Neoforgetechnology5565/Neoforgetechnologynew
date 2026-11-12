import "server-only";
import { C } from "./db";
import { adminDb } from "./firebase-admin";
import type { MeetingStore } from "./meeting-service";

/** Firestore-backed slot store. A slot is claimed with create(), which fails if the document exists, so two visitors can never hold the same slot. */
export function firestoreStore(): MeetingStore {
  const db = adminDb();
  return {
    async takenFrom(now) { const s = await db.collection(C.meetingSlots).where("start", ">=", now).get(); return new Set(s.docs.map((d) => d.data().start as number)); },
    async claim(start) { try { await db.collection(C.meetingSlots).doc(String(start)).create({ start, at: Date.now() }); return true; } catch { return false; } },
    async release(start) { await db.collection(C.meetingSlots).doc(String(start)).delete(); },
    async add(doc) { return (await db.collection(C.meetings).add(doc)).id; },
  };
}
