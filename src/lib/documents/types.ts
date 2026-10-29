export interface Health { ok: boolean; notice: string; limitations: string[]; ocr: { name: string; licence: string; languages: string; note: string }; limits: { max_file_mb: number; max_pages: number; max_megapixels: number; render_dpi: number; max_concurrent_jobs: number } }
export interface SampleInfo { id: string; title: string; file: string; kind: string; pages: number; description: string; provenance: string; licence: string; demonstrates: string[]; does_not_demonstrate: string[] }
export type DocStatus = "uploaded" | "queued" | "running" | "completed" | "cancelled" | "failed";
export type DocReview = "unreviewed" | "approved" | "needs_rework" | "rejected";
export interface DocInfo { document_id: string; filename: string; format: string; size_bytes: number; source: string; status: DocStatus; stage: string; error: string | null; pages: number | null; progress: { pages_done: number; pages_total: number; fraction: number; elapsed_seconds: number }; review: { status: DocReview; note: string; reviewed_at: number | null } }
export type Source = "embedded_text" | "ocr_model";
export interface Item { id: string; text: string; bbox: [number, number, number, number]; source: Source; conf: number | null; row: number; in_table: boolean }
export interface Table { id: string; page: number; bbox: [number, number, number, number]; rows: number; cols: number; cells: string[][]; row_edges: number[]; col_edges: number[]; method: string; header_row_assumed: boolean; empty_cells: number }
export interface Heading { item_id: string | null; text: string; level: number; rule: string }
export interface Page { page: number; width_px: number; height_px: number; source: Source; source_label: string; items: Item[]; tables: Table[]; headings: Heading[]; preprocessing: { deskew: { applied: boolean; correction_degrees?: number; estimated_degrees?: number; evidence_gain: number } | null; enhance: boolean }; ocr: { engine: string; seconds: number; lines: number; sensitivity: string } | null; warnings: string[]; image_url: string }
export type FieldStatus = "unreviewed" | "confirmed" | "corrected" | "rejected";
export interface Field { id: string; page: number; type: string; label: string | null; raw: string; value: string; currency: string | null; bbox: [number, number, number, number]; bbox_approximate: boolean; item_id: string | null; origin: "rule_parsed" | "manual"; based_on: Source; rule: string; ocr_confidence: number | null; flags: string[]; status: FieldStatus; original_value: string; current_value: string; note: string }
export interface Validation { rule: string; passed: boolean; detail: string; fields: string[] }
export interface Classification { label: string; method: string; scores: Record<string, number>; matched: Record<string, string[]>; note: string; tables_found: number }
export interface Results extends Omit<DocInfo, "pages"> {
  summary: { pages: number; text_items: number; items_by_source: Record<string, number>; ocr_lines: number; ocr_confidence: { mean: number; min: number; "lines_below_0.85": number } | null; tables: number; fields: number; fields_by_type: Record<string, number>; fields_flagged: number; validations: { run: number; failed: number }; seconds: Record<string, number> };
  classification: Classification; fields: Field[]; validations: Validation[]; warnings: string[]; pages: Page[]; params: { ocr_mode: string; deskew: boolean; enhance: boolean; sensitivity: string; pages: [number, number] | null }; ocr_engine: Health["ocr"]; limitations: string[]; legend: Record<string, string>;
}
export interface ProcessParams { ocr_mode: "auto" | "ocr" | "embedded"; deskew: boolean; enhance: boolean; sensitivity: "standard" | "high" }
export const SOURCE_STYLE: Record<Source, { label: string; stroke: string; chip: string }> = {
  embedded_text: { label: "PDF text layer", stroke: "#38bdf8", chip: "border-sky-500/50 bg-sky-500/10 text-sky-300" },
  ocr_model: { label: "OCR", stroke: "#f59e0b", chip: "border-amber-500/50 bg-amber-500/10 text-amber-300" },
};
export const FIELD_STATUS_LABEL: Record<FieldStatus, string> = { unreviewed: "Unreviewed", confirmed: "Confirmed", corrected: "Corrected", rejected: "Rejected" };
export const REVIEW_LABEL: Record<DocReview, string> = { unreviewed: "Not reviewed", approved: "Approved", needs_rework: "Needs rework", rejected: "Rejected" };
export const LOW_CONF = 0.85;
