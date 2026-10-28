/** Planning quantities from a measured area and the user's own assumptions. Nothing here is a default price, rate or coverage: the user supplies every number. */
export interface EstimateInput { areaM2: number; wastePct: number; coverageM2PerPackage: number | null; unitPrice: number | null }
export interface EstimateOutput { requiredM2: number; packages: number | null; cost: number | null }
export function estimate(i: EstimateInput): EstimateOutput | null {
  if (!(i.areaM2 > 0) || !(i.wastePct >= 0 && i.wastePct <= 100)) return null;
  const requiredM2 = i.areaM2 * (1 + i.wastePct / 100); // required quantity = measured area × (1 + waste allowance)
  const packages = i.coverageM2PerPackage && i.coverageM2PerPackage > 0 ? Math.ceil(requiredM2 / i.coverageM2PerPackage - 1e-9) : null; // whole packages: round up
  const cost = packages !== null && i.unitPrice !== null && i.unitPrice >= 0 ? packages * i.unitPrice : null;
  return { requiredM2, packages, cost };
}
