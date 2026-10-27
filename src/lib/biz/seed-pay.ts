import { DEFAULT_CONFIG, SHIFTS, defaultShift, payLine, payable, type Att, type PayRun, type ShiftAssign } from "./pay-calc";
import { seedHrm } from "./seed-hrm";
import { addDays, hash01, isWeekend } from "./util";

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const seedPay = () => {
  const h = seedHrm(); const att: Att[] = []; let n = 1;
  const emps = h.employees.filter((e) => e.status !== "Resigned" && e.id !== "e29");
  for (let d = "2026-02-02"; d <= "2026-03-13"; d = addDays(d, 1)) {
    for (const e of emps) {
      const onLeave = h.leave.some((l) => l.empId === e.id && l.status === "Approved" && l.from <= d && l.to >= d);
      if (e.hireDate > d || onLeave) continue; const k = `${e.id}${d}`;
      if (isWeekend(d)) { if (e.id === "e21" && (d === "2026-02-21" || d === "2026-03-07")) att.push({ id: `at${n++}`, empId: e.id, date: d, in: "08:00", out: "12:30", note: "Stock count (weekend overtime)" }); continue; }
      if (hash01(k + "abs") < 0.03) continue; // unexplained absence
      const sh = SHIFTS[defaultShift(e, d)]; const late = hash01(k + "late") < 0.12; const inM = toM(sh.start) + (late ? 8 + Math.floor(hash01(k + "l2") * 28) : -8 + Math.floor(hash01(k + "e") * 12));
      const ot = hash01(k + "ot") < 0.1 ? 60 + Math.floor(hash01(k + "o2") * 120) : 0; const outM = toM(sh.end) + 30 + (late ? 0 : -5) + Math.floor(hash01(k + "x") * 25) + ot;
      att.push({ id: `at${n++}`, empId: e.id, date: d, in: hm(inM), out: hm(outM) });
    }
  }
  const config = DEFAULT_CONFIG(); const assigns: ShiftAssign[] = [];
  const febLines = payable(h.employees, "2026-02").map((e) => payLine(e, "2026-02", att, h.leave, assigns, config, "2026-02-28"));
  const runs: PayRun[] = [{ id: "run-2026-02", period: "2026-02", status: "Finalised", createdAt: "2026-02-26", lines: febLines }];
  return { attendance: att, shifts: assigns, config, runs };
};
