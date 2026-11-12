/** Collection names (the same strings as C.daily / C.visitors / C.totals in lib/db.ts) and retention. */
export const COL = { daily: "analytics_daily", visitors: "analytics_visitors", totals: "analytics_totals" } as const;
export const SESSION_GAP_MS = 30 * 60_000;
/** Individual visitor records are deleted after this long without a visit; daily aggregate counters are anonymous and are kept. */
export const VISITOR_RETENTION_DAYS = 180;
export const JOURNEY_MAX = 40, CLICKLOG_MAX = 30;
