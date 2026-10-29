"""Wire-like candidate detection from point geometry (no learned model).

Pipeline (all distances in the cloud's coordinate units; metre defaults are scaled when the units are known):
  1. candidates: non-ground points at least `min_height` above the ground model
  2. local PCA on a neighbourhood: keep points whose neighbourhood is line-like (linearity >= threshold) with enough neighbours
  3. connected components of the candidates (single-linkage, `link` distance)
  4. per component, sequential RANSAC: a straight line in plan (x, y), then a parabola z(s) along it (a catenary is a parabola to good approximation
     for ordinary sags); inliers are removed and the search repeats so that parallel wires inside one component are separated
  5. each fitted span must have enough supporting points, length, point coverage along its length and a small residual; the rest is rejected.
A candidate is evidence of a thin, elevated, line-like structure that is well described by a sagging line. It is NOT proof that the structure is
a power or communication wire: rails, pipes, antennas, cables on poles and the edges of some structures can fit too. Sparse, noisy or partial data
produce no candidates, and the response says so instead of guessing.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

from .classify import local_features


@dataclass
class WireParams:
    min_height: float = 3.0  # above ground
    radius: float = 1.5  # neighbourhood for line-likeness
    min_linearity: float = 0.9
    max_axis_z: float = 0.5  # reject vertical structures (poles, tower legs): |z| of the local principal direction must not exceed this
    min_neighbors: int = 4
    link: float = 5.0  # clustering distance (must exceed the typical gap between wire returns)
    max_gap: float = 15.0  # supporting points separated by more than this along a fitted wire are reported as separate pieces
    min_support: int = 15  # points on a wire
    min_length: float = 10.0
    inlier_tol: float = 0.25  # distance from the fitted curve
    max_rms: float = 0.2
    min_coverage: float = 0.5  # share of 1-unit bins along the span that contain support
    max_wires: int = 80
    ransac_iters: int = 200

    @staticmethod
    def metres(upm: float, **kw) -> "WireParams":
        """Defaults expressed in metres, scaled to coordinate units; explicit overrides are already in coordinate units."""
        base = WireParams()
        for k in ("min_height", "radius", "link", "max_gap", "min_length", "inlier_tol", "max_rms"):
            setattr(base, k, getattr(base, k) * upm)
        for k, v in kw.items():
            if v is not None:
                setattr(base, k, type(getattr(base, k))(v))
        return base


@dataclass
class Wire:
    id: str
    origin: np.ndarray  # (3,) point on the plan line (float64, original coordinates)
    u: np.ndarray  # (2,) unit direction in plan
    s0: float
    s1: float
    coef: np.ndarray  # z(s) = c0 + c1 s + c2 s^2 with s measured from `origin`
    support: np.ndarray  # indices into the version's points
    rms: float
    max_residual: float
    coverage: float
    quality: str
    curve: str  # "line" | "parabola"
    meta: dict = field(default_factory=dict)

    def point(self, s: np.ndarray | float) -> np.ndarray:
        s = np.asarray(s, np.float64)
        z = self.coef[0] + self.coef[1] * s + self.coef[2] * s * s
        return np.stack([self.origin[0] + self.u[0] * s, self.origin[1] + self.u[1] * s, z], -1)

    def samples(self, step: float) -> np.ndarray:
        n = max(2, int(np.ceil((self.s1 - self.s0) / step)) + 1)
        return self.point(np.linspace(self.s0, self.s1, n))

    def length(self) -> float:
        s = np.linspace(self.s0, self.s1, 400)
        p = self.point(s)
        return float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())

    def sag(self) -> float:
        a, b = self.point(self.s0), self.point(self.s1)
        s = np.linspace(self.s0, self.s1, 200)
        p = self.point(s)
        t = (s - self.s0) / max(self.s1 - self.s0, 1e-9)
        chord = a[None, :] + t[:, None] * (b - a)[None, :]
        return float(np.abs(chord[:, 2] - p[:, 2]).max())

    def to_json(self) -> dict:
        a, b = self.point(self.s0), self.point(self.s1)
        return {"id": self.id, "support_points": int(len(self.support)), "endpoints": [[float(v) for v in a], [float(v) for v in b]], "length": round(self.length(), 3), "span_horizontal": round(float(self.s1 - self.s0), 3),
                "curve_model": self.curve, "sag": round(self.sag(), 3), "rms_residual": round(self.rms, 4), "max_residual": round(self.max_residual, 4), "coverage": round(self.coverage, 3), "quality": self.quality,
                "plan_direction_deg": round(float(np.degrees(np.arctan2(self.u[1], self.u[0])) % 180), 2), **self.meta}


def _quad_fit(s: np.ndarray, z: np.ndarray, deg: int) -> np.ndarray:
    co = np.polyfit(s, z, deg)
    coef = np.zeros(3)
    coef[: deg + 1] = co[::-1]
    return coef


def _fit_span(pts: np.ndarray, tol: float, iters: int, rng: np.random.Generator, bin_w: float = 2.5):
    """One robust round on pts (n,3 relative coordinates). Stage 1: RANSAC line in plan (x, y). Stage 2: RANSAC parabola z(s) among the plan-line
    inliers, so wires stacked at different heights over the same plan line (phase + shield wire) are separated. Returns (mask, origin_xy, u, coef, residual, s) or None."""
    n = len(pts)
    xy = pts[:, :2]
    best = None
    for _ in range(iters):
        i, j = rng.choice(n, 2, replace=False)
        d = xy[j] - xy[i]
        L = np.linalg.norm(d)
        if L < 1e-6:
            continue
        u = d / L
        perp = (xy - xy[i]) @ np.array([-u[1], u[0]])
        c = float(np.clip(1.0 - (perp / tol) ** 2, 0, None).sum())  # MSAC score: accurate inliers count more than marginal ones
        if best is None or c > best[0]:
            best = (c, np.abs(perp) <= tol, xy[i].copy(), u)
    if best is None or best[0] < 5:
        return None
    _, line_in, o, u = best
    # refine the plan line on its inliers
    for _ in range(2):
        q = xy[line_in] - xy[line_in].mean(0)
        u = np.linalg.svd(q, full_matrices=False)[2][0]
        o = xy[line_in].mean(0)
        perp = (xy - o) @ np.array([-u[1], u[0]])
        line_in = np.abs(perp) <= tol
    s = (xy - o) @ u
    perp = (xy - o) @ np.array([-u[1], u[0]])
    cand = np.nonzero(line_in)[0]
    if len(cand) < 5:
        return None
    span = float(s[cand].max() - s[cand].min())
    deg = 2 if span > 4 * tol else 1
    k = deg + 1
    best2 = None
    for _ in range(iters):
        pick = cand[rng.choice(len(cand), k, replace=False)]
        if len(np.unique(np.round(s[pick], 4))) < k:
            continue
        try:
            co = _quad_fit(s[pick], pts[pick, 2], deg)
        except (np.linalg.LinAlgError, ValueError):
            continue
        dz = pts[cand, 2] - (co[0] + co[1] * s[cand] + co[2] * s[cand] ** 2)
        ok = np.abs(dz) <= tol
        if int(ok.sum()) < 5:
            continue
        key = float(np.clip(1.0 - (dz / tol) ** 2, 0, None).sum())  # MSAC score: a curve that fits closely beats one that merely stays within the tolerance
        if best2 is None or key > best2[0]:
            best2 = (key, co)
    if best2 is None:
        return None
    coef = best2[1]
    for _ in range(4):  # least-squares refinement on the current inliers
        dz = pts[:, 2] - (coef[0] + coef[1] * s + coef[2] * s * s)
        res = np.hypot(perp, dz)
        inl = line_in & (np.abs(dz) <= tol)
        if inl.sum() < k + 1:
            return None
        coef = _quad_fit(s[inl], pts[inl, 2], deg)
    dz = pts[:, 2] - (coef[0] + coef[1] * s + coef[2] * s * s)
    res = np.hypot(perp, dz)
    inl = res <= tol
    return inl, o, u, coef, res, s


def _sse(s: np.ndarray, z: np.ndarray, tol: float) -> tuple[float, np.ndarray]:
    deg = 2 if (s.max() - s.min()) > 4 * tol and len(s) >= 8 else 1
    co = _quad_fit(s, z, deg)
    r = z - (co[0] + co[1] * s + co[2] * s * s)
    return float((r * r).sum()), co


def split_spans(s: np.ndarray, z: np.ndarray, tol: float, depth: int = 0) -> list[np.ndarray]:
    """Index groups (into s) that each follow one smooth curve. A single parabola through two consecutive spans of a line (the curve breaks at a support) fits
    with systematic residuals; those are detected by chunk-wise bias and split where two parabolas explain the points much better than one."""
    n = len(s)
    order = np.argsort(s)
    if n < 40 or depth >= 2:
        return [np.arange(n)]
    sse1, co1 = _sse(s[order], z[order], tol)
    res = z[order] - (co1[0] + co1[1] * s[order] + co1[2] * s[order] ** 2)
    chunks = np.array_split(res, 6)
    if max(abs(c.mean()) for c in chunks if len(c)) <= 0.3 * tol:
        return [np.arange(n)]
    best = None
    for k in range(int(0.15 * n), int(0.85 * n) + 1, max(1, n // 40)):
        a, b = order[:k], order[k:]
        if len(a) < 15 or len(b) < 15:
            continue
        e = _sse(s[a], z[a], tol)[0] + _sse(s[b], z[b], tol)[0]
        if best is None or e < best[0]:
            best = (e, a, b)
    if best is None or best[0] > 0.4 * sse1:
        return [np.arange(n)]
    out = []
    for part in (best[1], best[2]):
        for g in split_spans(s[part], z[part], tol, depth + 1):
            out.append(part[g])
    return out


def detect(xyz: np.ndarray, hag: np.ndarray, labels: np.ndarray, p: WireParams, seed: int = 0) -> tuple[list[Wire], dict]:
    """Returns (wires, diagnostics). `labels` marks ground (1) so it can be excluded; hag is height above the ground model."""
    rng = np.random.default_rng(seed)
    diag: dict = {"candidates_height": 0, "candidates_linear": 0, "components": 0, "rejected": {}}
    cand = np.nonzero((hag >= p.min_height) & (labels != 1))[0]
    diag["candidates_height"] = int(len(cand))
    if len(cand) < p.min_support:
        diag["reason"] = f"Only {len(cand)} points are at least {p.min_height:g} above the ground; fewer than the {p.min_support} supporting points a wire needs."
        return [], diag
    f = local_features(xyz[cand], p.radius, p.min_neighbors)
    lin = cand[(f["linearity"] >= p.min_linearity) & f["ok"] & (f["axis_z"] <= p.max_axis_z)]
    diag["candidates_linear"] = int(len(lin))
    if len(lin) < p.min_support:
        spacing = float(np.median(cKDTree(xyz[cand]).query(xyz[cand], k=2)[0][:, 1])) if len(cand) > 2 else float("nan")
        diag["reason"] = (f"No line-like structure was found among {len(cand)} elevated points (median point spacing {spacing:.2f}). The data may be too sparse for the neighbourhood radius {p.radius:g}, too noisy, "
                          "or contain no wires in view.")
        diag["median_spacing"] = spacing
        return [], diag
    P = xyz[lin]
    ctr = P.mean(0)
    pr = P - ctr
    tree = cKDTree(pr)
    pairs = tree.query_pairs(p.link, output_type="ndarray")
    g = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(pr), len(pr)))
    ncomp, comp = connected_components(g, directed=False)
    diag["components"] = int(ncomp)
    wires: list[Wire] = []
    rej = diag["rejected"]

    attempts: list[dict] = diag.setdefault("rejected_attempts", [])

    def reject(why: str, **info):
        rej[why] = rej.get(why, 0) + 1
        if info and len(attempts) < 30:
            attempts.append({"reason": why, **{k: (round(v, 3) if isinstance(v, float) else v) for k, v in info.items()}})

    for cid in range(ncomp):
        members = np.nonzero(comp == cid)[0]
        if len(members) < p.min_support:
            reject("component smaller than min_support")
            continue
        remaining = members
        for _round in range(12):
            if len(remaining) < p.min_support or len(wires) >= p.max_wires:
                break
            sub = pr[remaining]
            r = _fit_span(sub, p.inlier_tol, p.ransac_iters, rng, max(p.link / 2.0, 1e-9))
            if r is None:
                reject("no consistent line")
                break
            inl, o, u, coef, res, s = r
            if inl.sum() < p.min_support:
                reject("too few supporting points", inliers=int(inl.sum()))
                break
            in_idx = np.nonzero(inl)[0]
            cur = remaining
            remaining = remaining[~inl]
            groups = []
            o_s = np.argsort(s[in_idx])
            cut = np.nonzero(np.diff(s[in_idx][o_s]) > p.max_gap)[0] + 1  # inliers separated by more than max_gap are different pieces
            for piece in np.split(o_s, cut):
                for grp in split_spans(s[in_idx][piece], sub[in_idx[piece], 2], p.inlier_tol):
                    groups.append(piece[grp])
            accepted = np.zeros(len(in_idx), bool)
            for grp in groups:
                gi = in_idx[grp]
                if len(gi) < p.min_support:
                    reject("too few supporting points", inliers=int(len(gi)))
                    continue
                s_in = s[gi]
                length_h = float(s_in.max() - s_in.min())
                if length_h < p.min_length:
                    reject("shorter than min_length", inliers=int(len(gi)), length=length_h)
                    continue
                deg = 2 if length_h > 4 * p.inlier_tol else 1
                co = _quad_fit(s_in, sub[gi, 2], deg)
                nrm = np.array([-u[1], u[0]])
                perp = (sub[gi, :2] - o) @ nrm
                dz = sub[gi, 2] - (co[0] + co[1] * s_in + co[2] * s_in * s_in)
                rr = np.hypot(perp, dz)
                bw = max(p.link / 2.0, 1e-9)
                cov = len(np.unique(np.floor((s_in - s_in.min()) / bw).astype(int))) / (int(np.ceil(length_h / bw)) + 1)
                rms = float(np.sqrt(np.mean(rr ** 2)))
                if cov < p.min_coverage:
                    reject("points do not cover the span", inliers=len(gi), length=length_h, coverage=cov)
                    continue
                if rms > p.max_rms:
                    reject("residual too large", inliers=len(gi), length=length_h, rms=rms)
                    continue
                origin = np.array([o[0] + ctr[0], o[1] + ctr[1], 0.0])
                c0 = co.copy()
                c0[0] += ctr[2]
                curve = "line" if abs(co[2]) * (length_h / 2) ** 2 < p.inlier_tol * 0.5 else "parabola"
                strong = len(gi) >= 60 and cov >= 0.7 and rms <= 0.5 * p.max_rms
                quality = "strong" if strong else ("moderate" if len(gi) >= 30 and cov >= 0.6 else "weak")
                accepted[grp] = True
                wires.append(Wire(f"W{len(wires) + 1}", origin, u, float(s_in.min()), float(s_in.max()), c0, lin[cur[gi]], rms, float(rr.max()), float(cov), quality, curve,
                                 {"method": "line-likeness (PCA) + connected components + sequential RANSAC (plan line, then parabola in height), spans split where one curve does not fit",
                                  "limitations": "Geometric candidate: it may be another thin elevated structure (rail, pipe, antenna, cable) and short spans may be missed."}))
            if not accepted.all():  # points that did not become part of an accepted wire may still belong to another one
                remaining = np.concatenate([remaining, cur[in_idx[~accepted]]])
    diag["wires_found"] = len(wires)
    if not wires:
        diag["reason"] = f"{len(lin)} line-like elevated points formed {ncomp} group(s), but none passed the span checks (rejections: {rej or 'none'}). The structure could not be reliably identified."
    return wires, diag
