/** Shared result types for the demonstrations that are not plain plan → 3D conversions. */
import type { MeshEl } from "../model";
import type { DemoKey } from "../suite-keys";

export interface Table { id: string; title: string; columns: string[]; rows: (string | number | null)[][]; note?: string; /** column index holding an element id that can be selected in the viewer */ elementCol?: number }
export interface Issue { id: string; severity: "error" | "warning" | "info"; rule: string; title: string; detail: string; element?: string; location?: number[] }
export interface Headline { label: string; value: string | number; note?: string }
/** Extra analysis attached to a model: headline numbers, tables, findings, the parameters used. */
export interface Ext { demo: DemoKey; headline: Headline[]; tables: Table[]; issues: Issue[]; params: Record<string, unknown>; notes: string[]; extra?: Record<string, unknown> }
export interface ElementInfo { title: string; props: [string, string][] }
export interface Preview2d { extents: { x0: number; y0: number; x1: number; y1: number }; layers: { name: string; color: string; paths: number[][]; closed?: boolean[] }[]; marks?: { x: number; y: number; label: string; severity?: string }[] }
export interface CloudView { count: number; shown: number; bbox: { min: number[]; max: number[] }; positions: number[]; colors?: number[]; planeIdx: number[]; planes: { id: number; label: string; kind: string; normal: number[]; d: number; count: number; rms: number; area: number; centroid: number[]; extent: number[] }[] }
/** Models of the demonstrations that have no building: CAD analysis, point cloud, structural drawings, collaboration. */
export interface AnalysisModel {
  kind: "analysis"; demo: DemoKey; generatedAt: number; version: number; sample: boolean; inputs: { name: string; format: string; support: string; role: string }[];
  ext: Ext; preview2d?: Preview2d; cloud?: CloudView; meshes: MeshEl[]; elements: Record<string, ElementInfo>; needsInput: { field: string; question: string; options?: { label: string; value: number }[] }[];
  warnings: string[]; assumptions: string[]; limitations: string[]; provenance: string; data?: Record<string, unknown>;
}
export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
