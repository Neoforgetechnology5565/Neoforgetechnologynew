import type { EventRec } from "./types";
type Raw = Omit<EventRec, "id" | "jobId" | "review">;
/** Deterministic ids so review decisions survive re-analysis with new settings. */
export const eventId = (e: Raw) => `${e.type}-${e.trackId}-${e.frame}${e.zone ? `-z${e.zone}` : ""}${e.line ? `-l${e.line}` : ""}`.replace(/[^\w-]/g, "_");
export const withIds = (jobId: string, events: Raw[], reviews: Record<string, string> = {}): EventRec[] =>
  events.map((e) => ({ ...e, id: eventId(e), jobId, review: (reviews[eventId(e)] as EventRec["review"]) ?? "unreviewed" }));
