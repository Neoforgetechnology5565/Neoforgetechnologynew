import { seedHrm } from "./seed-hrm";
import { addDays, hash01, isWeekend, DEMO_TODAY } from "./util";

export type PStatus = "Planning" | "Active" | "On hold" | "Completed";
export type TaskStatus = "Backlog" | "To do" | "In progress" | "Review" | "Done";
export type TaskPriority = "Low" | "Medium" | "High" | "Critical";
export interface Project { id: string; code: string; name: string; clientId: string; type: string; pmId: string; start: string; deadline: string; budget: number; status: PStatus; description: string }
export interface Task { id: string; projectId: string; title: string; assigneeId: string; status: TaskStatus; priority: TaskPriority; due: string; est: number; milestoneId: string }
export interface Milestone { id: string; projectId: string; name: string; date: string; done: boolean }
export interface TimeEntry { id: string; projectId: string; taskId: string; empId: string; date: string; hours: number; note: string }
export const TASK_STATUSES: TaskStatus[] = ["Backlog", "To do", "In progress", "Review", "Done"];

const P = (n: number, name: string, clientId: string, type: string, pmId: string, start: string, deadline: string, budget: number, status: PStatus, description: string): Project => ({ id: `pr${n}`, code: `PRJ-${100 + n}`, name, clientId, type, pmId, start, deadline, budget, status, description });
// [title, assignee, status, priority, due, est hours]
type T = [string, string, TaskStatus, TaskPriority, string, number];
const PLAN: Record<string, { ms: [string, string, boolean][]; tasks: T[] }> = {
  pr1: { ms: [["Discovery complete", "2026-01-30", true], ["Design sign-off", "2026-03-06", true], ["Beta release", "2026-04-17", false], ["Go-live", "2026-05-29", false]], tasks: [["Requirements workshop", "e18", "Done", "High", "2026-01-23", 40], ["UX wireframes", "e19", "Done", "Medium", "2026-02-13", 80], ["Authentication service", "e15", "Done", "High", "2026-03-06", 120], ["Shipment tracking API", "e15", "In progress", "Critical", "2026-03-27", 160], ["Customer dashboard UI", "e16", "In progress", "High", "2026-04-03", 140], ["Notification service", "e16", "To do", "Medium", "2026-04-10", 90], ["End-to-end test suite", "e17", "To do", "High", "2026-05-08", 110], ["Data migration scripts", "e15", "Backlog", "Medium", "2026-05-15", 70]] },
  pr2: { ms: [["Kick-off", "2026-02-05", true], ["Field pilot", "2026-03-27", false], ["Handover", "2026-04-30", false]], tasks: [["Site report data model", "e16", "Done", "High", "2026-02-20", 50], ["Offline sync engine", "e15", "Review", "Critical", "2026-03-13", 100], ["Photo upload & annotation", "e16", "In progress", "Medium", "2026-03-20", 60], ["Pilot training material", "e19", "To do", "Low", "2026-03-24", 24], ["Pilot feedback fixes", "e17", "Backlog", "Medium", "2026-04-17", 40]] },
  pr3: { ms: [["Requirements baseline", "2025-12-05", true], ["Data integration", "2026-02-20", true], ["Plant acceptance test", "2026-04-01", false], ["Release", "2026-04-15", false]], tasks: [["PLC data connectors", "e14", "Done", "Critical", "2025-12-19", 120], ["Dashboard KPIs", "e16", "Done", "High", "2026-01-30", 110], ["Alert rules engine", "e15", "Done", "High", "2026-02-27", 130], ["Operator tablet UI", "e19", "In progress", "High", "2026-03-10", 90], ["Performance tuning", "e15", "In progress", "Critical", "2026-03-12", 80], ["Acceptance test plan", "e17", "To do", "Medium", "2026-03-20", 40], ["Training sessions", "e18", "Backlog", "Low", "2026-04-08", 32]] },
  pr4: { ms: [["Design freeze", "2026-01-16", true], ["Structural works complete", "2026-03-20", false], ["Services first fix", "2026-04-24", false], ["Handover", "2026-06-30", false]], tasks: [["Site survey & setup", "e21", "Done", "High", "2025-12-12", 60], ["Procure partitioning", "e22", "Done", "Medium", "2026-01-30", 40], ["Demolition & structure", "e21", "In progress", "Critical", "2026-03-20", 260], ["Electrical first fix", "e23", "To do", "High", "2026-04-17", 180], ["Furniture delivery planning", "e22", "To do", "Medium", "2026-05-15", 50], ["Safety inspection", "e20", "Backlog", "High", "2026-04-30", 24]] },
  pr5: { ms: [["Data audit", "2026-02-27", true], ["Prototype dashboards", "2026-03-20", false], ["Launch", "2026-04-10", false]], tasks: [["Booking data audit", "e16", "Done", "Medium", "2026-02-27", 36], ["Occupancy model", "e15", "In progress", "High", "2026-03-18", 70], ["Revenue dashboard", "e19", "In progress", "Medium", "2026-03-25", 50], ["Stakeholder demo", "e18", "To do", "Low", "2026-04-02", 16]] },
  pr6: { ms: [["Kick-off", "2026-03-09", false], ["Prototype", "2026-05-08", false], ["Delivery", "2026-07-31", false]], tasks: [["Inspection checklist model", "e15", "To do", "High", "2026-03-27", 60], ["Mobile app skeleton", "e16", "To do", "Medium", "2026-04-17", 90], ["Report generator", "e15", "Backlog", "Medium", "2026-06-05", 100]] },
  pr7: { ms: [["Kick-off", "2025-09-12", true], ["Integration live", "2026-01-30", true], ["Closure", "2026-02-27", true]], tasks: [["Interface specification", "e18", "Done", "High", "2025-10-10", 40], ["Integration build", "e15", "Done", "Critical", "2025-12-19", 160], ["User acceptance", "e17", "Done", "High", "2026-02-06", 60], ["Handover pack", "e18", "Done", "Low", "2026-02-27", 24]] },
};
export const seedProj = () => {
  const emps = seedHrm().employees;
  const projects: Project[] = [
    P(1, "Customer portal rebuild", "c1", "Software development", "e18", "2026-01-05", "2026-05-29", 148000, "Active", "New customer portal with shipment tracking and notifications."),
    P(2, "Site progress reporting app", "c2", "Digital services", "e18", "2026-02-02", "2026-04-30", 62000, "Active", "Offline-first mobile reporting for construction sites."),
    P(3, "Production reporting dashboard", "c13", "Engineering", "e14", "2025-11-10", "2026-04-15", 82000, "Active", "Plant KPIs, alert rules and operator tablets."),
    P(4, "Campus fit-out coordination", "c11", "Construction", "e20", "2025-12-01", "2026-06-30", 124000, "Active", "Coordination of fit-out works across three campus buildings."),
    P(5, "Hotel booking analytics", "c8", "Digital services", "e18", "2026-02-16", "2026-04-10", 36000, "Active", "Occupancy and revenue dashboards for hotel managers."),
    P(6, "Asset inspection tool", "c9", "Software development", "e14", "2026-03-02", "2026-07-31", 83000, "Planning", "Mobile inspections and automated reports for energy assets."),
    P(7, "MRO system integration", "c7", "Software development", "e18", "2025-09-01", "2026-02-27", 52000, "Completed", "Integration between the MRO system and the client's ERP."),
  ];
  const milestones: Milestone[] = []; const tasks: Task[] = []; const time: TimeEntry[] = []; let mn = 1, tn = 1, en = 1;
  for (const p of projects) {
    const plan = PLAN[p.id]; const ms = plan.ms.map(([name, date, done]) => { const m = { id: `ms${mn++}`, projectId: p.id, name, date, done }; milestones.push(m); return m; });
    for (const [title, assigneeId, status, priority, due, est] of plan.tasks) {
      const t: Task = { id: `tk${tn++}`, projectId: p.id, title, assigneeId, status, priority, due, est, milestoneId: ms.find((m) => m.date >= due)?.id ?? ms.at(-1)!.id }; tasks.push(t);
      const factor = { Done: 1.0 + hash01(t.id) * 0.2, Review: 0.9, "In progress": 0.45 + hash01(t.id) * 0.3, "To do": 0, Backlog: 0 }[status]; let left = Math.round(est * factor); if (!left) continue;
      const start = p.start > addDays(due, -75) ? p.start : addDays(due, -75); const end = status === "Done" && due < DEMO_TODAY ? due : addDays(DEMO_TODAY, -1);
      for (let pass = 0; pass < 2 && left > 0; pass++) for (let d = start, k = 0; d <= end && left > 0; d = addDays(d, 1)) { if (isWeekend(d) || (pass === 0 && hash01(t.id + d) > 0.6)) continue; const h = Math.min(left, 3 + Math.round(hash01(t.id + d + "h") * 4)); time.push({ id: `te${en++}`, projectId: p.id, taskId: t.id, empId: assigneeId, date: d, hours: h, note: k++ % 3 === 0 ? "Implementation" : "Progress on task" }); left -= h; }
    }
  }
  const rates: Record<string, number> = {}; for (const e of emps) rates[e.id] = Math.round((e.salary / 2080) * 1.6);
  // Budgets are set so the sample portfolio shows a realistic spread: one overrun, one at risk, the rest within budget.
  const target: Record<string, number> = { pr1: 0.46, pr2: 0.6, pr3: 1.07, pr4: 0.38, pr5: 0.93, pr7: 0.96 };
  for (const p of projects) if (target[p.id]) { const cost = time.filter((x) => x.projectId === p.id).reduce((a, x) => a + x.hours * (rates[x.empId] ?? 65), 0); p.budget = Math.round(cost / target[p.id] / 1000) * 1000; }
  return { projects, tasks, milestones, time, rates, nextNo: { project: 108 }, board: { groupBy: "status" as "status" | "assignee" | "priority", hidden: [] as string[], wip: {} as Record<string, number> } };
};
