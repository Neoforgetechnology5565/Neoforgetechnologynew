import type { Box, Pt } from "./types";
/** Ray-casting point-in-polygon on normalised coordinates. */
export function inPolygon(p: Pt, poly: Pt[]): boolean {
  if (poly.length < 3) return false; let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Where an animal touches the ground in the image: the bottom-centre of its box. */
export const groundPoint = (b: Box, w: number, h: number): Pt => [((b.x1 + b.x2) / 2) / w, b.y2 / h];
