/** Run with: npx tsx src/lib/demo-calc.test.ts */
import assert from "node:assert/strict";
import { beam, beamClosedForm, convert, loads, quantity, section, type BeamIn } from "./demo-calc";

const close = (a: number, b: number, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} expected ${b}, got ${a}`);
const base: BeamIn = { c: "ss-udl", L: 6, w: 10, P: 0, a: 0, E: 210, I: 8000e4, c_mm: 100, fy: 275 }; // I = 8000 cm⁴ = 8e7 mm⁴

// EI = 210e6 kN/m² × 8e-5 m⁴ = 16800 kN·m²
let r = beam(base); close(r.EI, 16800); close(r.RA, 30); close(r.RB, 30); close(r.Mmax, 45, 1e-4); close(r.defl, 10.0446, 2e-4, "UDL deflection mm"); close(r.xM, 3, 0.02);
close(r.sigma, (45e6 / (8e7 / 100)), 1e-3, "bending stress");   // 56.25 MPa
// equilibrium and symmetry
close(r.V[0], 30); close(r.V[100], -30); close(r.M[0], 0, 1e-9); close(r.M[100], 0, 1e-6);

r = beam({ ...base, c: "ss-central", L: 4, P: 20 }); close(r.RA, 10); close(r.Mmax, 20, 1e-4); close(r.defl, 1.5873, 2e-4, "central load deflection mm");
r = beam({ ...base, c: "ss-point", L: 4, P: 12, a: 1 }); close(r.RA, 9); close(r.RB, 3); close(r.Mmax, 9, 1e-3); close(r.xM, 1, 0.05);
r = beam({ ...base, c: "cant-udl", L: 2, w: 5 }); close(r.RA, 10); close(r.MA, 10); close(r.Mmax, 10, 1e-4); close(r.defl, 0.5952, 2e-4, "cantilever UDL mm");
r = beam({ ...base, c: "cant-point", L: 2, P: 5 }); close(r.RA, 5); close(r.MA, 10); close(r.defl, (5 * 8) / (3 * 16800) * 1000, 2e-4, "cantilever point mm");
// diagram maxima agree with closed-form expressions
for (const c of ["ss-udl", "ss-central", "ss-point", "cant-udl", "cant-point"] as const) { const i = { ...base, c, L: 5.5, w: 7, P: 18, a: 1.7 }; const num = beam(i), cf = beamClosedForm(i); close(num.Mmax, cf.M, 2e-3, `${c} Mmax`); close(num.defl / 1000, cf.d, 5e-3, `${c} deflection`); }

// sections
let s = section({ shape: "rect", b: 100, h: 200, d: 0, t: 0, tf: 0, tw: 0, rho: 7850 }); close(s.A, 20000); close(s.Ix, 66666666.67, 1e-6); close(s.Zx, 666666.67, 1e-6); close(s.Iy, 16666666.67, 1e-6); close(s.mass, 157);
s = section({ shape: "circle", b: 0, h: 0, d: 100, t: 0, tf: 0, tw: 0, rho: 7850 }); close(s.A, 7853.98, 1e-5); close(s.Ix, 4908738.52, 1e-6); close(s.Zx, 98174.77, 1e-6);
s = section({ shape: "rhs", b: 100, h: 200, d: 0, t: 10, tf: 0, tw: 0, rho: 7850 }); close(s.A, 20000 - 80 * 180); close(s.Ix, (100 * 200 ** 3 - 80 * 180 ** 3) / 12, 1e-9);
s = section({ shape: "ibeam", b: 100, h: 200, d: 0, t: 0, tf: 10, tw: 6, rho: 7850 }); close(s.A, 2 * 100 * 10 + 180 * 6); close(s.Ix, (100 * 200 ** 3 - 94 * 180 ** 3) / 12, 1e-9);

// quantities
let q = quantity({ shape: "slab", L: 5, B: 4, H: 0.2, D: 0, n: 1, openings: 0, rho: 2400, waste: 0 }); close(q.total.vol, 4); close(q.mass, 9.6); close(q.total.formwork, 20 + 2 * 9 * 0.2);
q = quantity({ shape: "column-round", L: 0, B: 0, H: 3, D: 0.4, n: 4, openings: 0, rho: 2400, waste: 5 }); close(q.one.vol, Math.PI * 0.16 * 3 / 4); close(q.order, q.total.vol * 1.05);
q = quantity({ shape: "wall", L: 10, B: 0.2, H: 3, D: 0, n: 1, openings: 4, rho: 2400, waste: 0 }); close(q.total.vol, (30 - 4) * 0.2);

// conversions
close(convert("Length", 1, "in", "mm").result, 25.4); close(convert("Length", 10, "ft", "m").result, 3.048); close(convert("Force", 1, "kN", "lbf").result, 224.8089, 1e-6);
close(convert("Stress", 1, "MPa", "psi").result, 145.0377, 1e-6); close(convert("Volume", 1, "m³", "ft³").result, 35.3147, 1e-5); close(convert("Stress", 30, "MPa", "GPa").result, 0.03); close(convert("Moment", 1, "kip·ft", "kN·m").result, 1.3558179, 1e-6);
assert.throws(() => convert("Length", 1, "in", "kg"));

// loads
const l = loads({ Lx: 6, Ly: 4, g: 3, q: 2.5, gf: 1.35, qf: 1.5, beamSpan: 6, trib: 3 }); close(l.char, 5.5); close(l.uls, 1.35 * 3 + 1.5 * 2.5); close(l.lineUls, 7.8 * 3); close(l.beamEndReaction, 7.8 * 3 * 6 / 2); close(l.floorChar, 132);
console.log("demo-calc: all tests passed");
