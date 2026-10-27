import type { Milestone, Project, Task, TimeEntry } from "./seed-proj";
import { DEMO_TODAY, round2, sum } from "./util";

export interface ProjData { projects: Project[]; tasks: Task[]; milestones: Milestone[]; time: TimeEntry[]; rates: Record<string, number> }
export const rateOf = (d: Pick<ProjData, "rates">, empId: string) => d.rates[empId] ?? 65;
export const hoursOf = (d: ProjData, projectId: string) => round2(sum(d.time.filter((t) => t.projectId === projectId), (t) => t.hours));
export const costOf = (d: ProjData, projectId: string) => round2(sum(d.time.filter((t) => t.projectId === projectId), (t) => t.hours * rateOf(d, t.empId)));
/** Progress = estimated hours of completed tasks ÷ estimated hours of all tasks. */
export const progressOf = (d: ProjData, projectId: string) => { const ts = d.tasks.filter((t) => t.projectId === projectId); const total = sum(ts, (t) => t.est); return total ? sum(ts.filter((t) => t.status === "Done"), (t) => t.est) / total : 0; };
export const taskOverdue = (t: Task) => t.status !== "Done" && t.due < DEMO_TODAY;
export const budgetState = (cost: number, budget: number) => (cost > budget ? "Over budget" : cost > budget * 0.9 ? "At risk" : "Within budget");
/** Simple forecast: cost to date ÷ progress, when progress is meaningful. */
export const forecastCost = (cost: number, progress: number) => (progress >= 0.1 ? round2(cost / progress) : null);
