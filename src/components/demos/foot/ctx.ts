import type { CaptureDTO, SessionDTO } from "@/lib/foot/api-types";
import type { Results } from "@/lib/foot/results";
import type { Side } from "@/lib/foot/types";
import type { Auth } from "./api";
import type { Unit } from "./report";

export type Step = "setup" | "capture" | "review" | "results" | "fit" | "report";
export const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: "setup", label: "Method", hint: "Choose how to capture" }, { id: "capture", label: "Photos", hint: "Take or upload" }, { id: "review", label: "Review", hint: "Check quality & scale" },
  { id: "results", label: "Results", hint: "Measure & compare" }, { id: "fit", label: "Fit", hint: "Shoe sizes" }, { id: "report", label: "Report", hint: "Save & export" },
];
export interface ObjFile { text: string; unit: "mm" | "cm" | "m"; filename: string }
export interface Ctx {
  auth: Auth; session: SessionDTO; captures: CaptureDTO[]; results: Results | null; unit: Unit; setUnit: (u: Unit) => void;
  step: Step; go: (s: Step) => void; side: Side; setSide: (s: Side) => void; sel: string | null; setSel: (id: string | null) => void;
  refresh: () => Promise<void>; replaceCapture: (c: CaptureDTO) => void; notify: (m: string, bad?: boolean) => void;
  objs: Partial<Record<Side, ObjFile>>; setObj: (s: Side, f: ObjFile | undefined) => void; logoSrc?: string; closeSession: () => void; removeSession: () => Promise<void>;
}
