/** Sample clips shipped with the site. They are SYNTHETIC (rendered shapes, no real people or vehicles) and carry precomputed reference annotations. */
export interface Sample { id: string; name: string; description: string; file: string; durationSec: number; width: number; height: number; fps: number; annotations: string; defaultZones?: boolean }
export const SAMPLES: Sample[] = [
  { id: "gate-crossing", name: "Gate crossing (synthetic)", description: "Rendered pedestrian and vehicle shapes crossing a gate line. Reference annotations, no AI inference.", file: "/cctv/gate-crossing.mp4", durationSec: 12, width: 640, height: 360, fps: 25, annotations: "/cctv/gate-crossing.json" },
  { id: "loading-bay", name: "Restricted bay (synthetic)", description: "Rendered shapes entering and dwelling in a restricted area. Reference annotations, no AI inference.", file: "/cctv/loading-bay.mp4", durationSec: 14, width: 640, height: 360, fps: 25, annotations: "/cctv/loading-bay.json" },
];
export const SAMPLE_MAP = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));
