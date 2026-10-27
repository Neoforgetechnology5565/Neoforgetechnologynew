import type { Ticket } from "./seed-desk";
import { SLA_HOURS } from "./seed-desk";
import { DEMO_NOW, hoursBetween } from "./util";
export const isOpen = (t: Ticket) => t.status !== "Resolved" && t.status !== "Closed";
export const overdue = (t: Ticket) => isOpen(t) && t.due < DEMO_NOW;
export const atRisk = (t: Ticket) => isOpen(t) && !overdue(t) && hoursBetween(DEMO_NOW, t.due) <= SLA_HOURS[t.priority] * 0.25;
