/** Shapes returned by services/defect-inspector. Model output, automated recommendation and human decision are separate objects on purpose. */
export type Decision = "PASS" | "FAIL" | "MANUAL_REVIEW";
export interface Region {
  id: number; bbox: [number, number, number, number]; centroid: [number, number]; area_px: number; area_pct: number; peak_score: number; score_ratio: number; mean_score_ratio: number;
  status: "flagged" | "borderline"; severity: string; polygon: [number, number][]; category: string; category_note: string;
}
export interface ConditionCheck { level: string; code: string; text: string }
export interface ModelOutput { anomaly_score: number; reference_threshold: number; score_ratio: number; score_meaning: string; regions: Region[]; image: { width: number; height: number }; condition_checks: ConditionCheck[] }
export interface Rules { max_defects: number; min_score_ratio: number; review_band: number; min_region_area_pct: number; major_area_pct: number | null; fail_on_major_only: boolean; min_reference_images: number; wrong_part_ratio: number }
export const DEFAULT_RULES: Rules = { max_defects: 0, min_score_ratio: 1.0, review_band: 0.85, min_region_area_pct: 0.01, major_area_pct: null, fail_on_major_only: false, min_reference_images: 30, wrong_part_ratio: 3.0 };
export interface Recommendation { decision: Decision; reasons: string[]; rule_trace: string[]; rules: Rules; disclaimer: string }
export interface ReviewEntry { decision: Decision; action: "confirm" | "override"; notes: string; reviewer: string; at: number; agrees_with_recommendation: boolean; recommendation_at_review: Decision; rules_revision: number; region_reviews: Record<string, "confirmed" | "dismissed" | "pending"> }
export interface Evaluation { test_normal: number; test_anomalous: number; image_auroc: number; pixel_auroc: number; at_threshold: { true_positive_rate: number; false_positive_rate: number }; tau: number }
export interface ReferenceInfo { id: string; name: string; kind: "builtin" | "custom"; good_images: number; validated: boolean; status: "building" | "ready" | "failed"; error: string | null; input_size: number; threshold: number; evaluation: Evaluation | null; notes: string[] }
export interface Inspection {
  id: string; created_at: number; filename: string; source: "upload" | "sample"; reference: { id: string; name: string; kind: string; good_images: number; validated: boolean; threshold: number; evaluation: Evaluation | null; notes: string[] };
  inference_ms: number; dataset_annotation: { label: "normal" | "anomalous"; source: string; licence: string } | null; method: string; limitations: string[]; model_output: ModelOutput; recommendation: Recommendation;
  review: { history: ReviewEntry[]; current: ReviewEntry | null }; rules_revision?: number;
}
export interface Summary { id: string; created_at: number; filename: string; source: string; reference: string; score_ratio: number; flagged_regions: number; recommendation: Decision; human_decision: Decision | null; thumb_url: string }
export interface SampleImage { id: string; reference_id: string; title: string; label: "normal" | "anomalous"; file: string; mask: string | null; image_url: string; licence: string; attribution: string; modification: string }
export interface Health { ok: boolean; backbone: string; method: string; references: number; builtin_references: number; limits: { max_image_mb: number; min_reference_images: number; max_reference_images: number; inspection_ttl_seconds: number }; limitations: string[] }
export const DECISION_LABEL: Record<Decision, string> = { PASS: "PASS", FAIL: "FAIL", MANUAL_REVIEW: "MANUAL REVIEW" };
export const DECISION_STYLE: Record<Decision, string> = { PASS: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200", FAIL: "border-red-500/60 bg-red-500/10 text-red-200", MANUAL_REVIEW: "border-amber-500/60 bg-amber-500/10 text-amber-200" };
