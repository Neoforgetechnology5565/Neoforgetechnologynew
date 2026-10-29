"""Derived results. Pure functions over the stored observations (pipeline.Analysis), so areas, calibration and thresholds can change without reprocessing.

Wording is deliberately neutral and every result says what it can and cannot show: tracks are temporary numbers (no face or identity recognition),
ball positions are only the detected ones, and calibration maps one flat plane."""
from __future__ import annotations

import math
from collections import defaultdict

import cv2
import numpy as np

from .pipeline import Analysis

TABLE_L, TABLE_W = 2.74, 1.525   # ITTF table tennis table, metres
COURT_L, COURT_W = 28.0, 15.0    # FIBA basketball court, metres

# Named court landmarks (world metres, origin at the bottom-left corner of the full court, x along the length).
COURT_LANDMARKS = {
    "Corner: baseline left / sideline bottom": (0.0, 0.0), "Corner: baseline right / sideline bottom": (28.0, 0.0),
    "Corner: baseline right / sideline top": (28.0, 15.0), "Corner: baseline left / sideline top": (0.0, 15.0),
    "Halfway line at bottom sideline": (14.0, 0.0), "Halfway line at top sideline": (14.0, 15.0), "Centre circle centre": (14.0, 7.5),
    "Left free-throw line, bottom end of lane": (5.8, 5.05), "Left free-throw line, top end of lane": (5.8, 9.95),
    "Left lane corner on baseline, bottom": (0.0, 5.05), "Left lane corner on baseline, top": (0.0, 9.95),
    "Right free-throw line, bottom end of lane": (22.2, 5.05), "Right free-throw line, top end of lane": (22.2, 9.95),
    "Right lane corner on baseline, bottom": (28.0, 5.05), "Right lane corner on baseline, top": (28.0, 9.95),
}


class CalibrationError(ValueError):
    pass


# ---------------------------------------------------------------------------------------------------------------- geometry
def foot(box: list[float]) -> tuple[float, float]:
    return (box[0] + box[2]) / 2, box[3]


def inside(poly: list[list[float]], pt: tuple[float, float]) -> bool:
    return cv2.pointPolygonTest(np.array(poly, np.float32).reshape(-1, 1, 2), (float(pt[0]), float(pt[1])), False) >= 0


def valid_polygon(poly) -> list[list[float]]:
    if not isinstance(poly, list) or not 3 <= len(poly) <= 40:
        raise CalibrationError("The monitored area needs between 3 and 40 corner points.")
    try:
        pts = [[float(p[0]), float(p[1])] for p in poly]
    except (TypeError, ValueError, IndexError):
        raise CalibrationError("The monitored area points must be [x, y] pairs.") from None
    a = abs(cv2.contourArea(np.array(pts, np.float32)))
    if a < 25:
        raise CalibrationError("The monitored area is too small or its points are in a line.")
    return pts


def fit_homography(img: list[list[float]], world: list[list[float]]) -> tuple[np.ndarray, dict]:
    """Least-squares homography from image pixels to a world plane in metres, with the reprojection error reported in metres."""
    if len(img) != len(world) or len(img) < 4:
        raise CalibrationError("At least four matching reference points are required.")
    try:
        a = np.array(img, np.float64).reshape(-1, 2)
        w = np.array(world, np.float64).reshape(-1, 2)
    except ValueError:
        raise CalibrationError("Reference points must be [x, y] pairs.") from None
    if len({tuple(p) for p in a.tolist()}) < len(a):
        raise CalibrationError("Two reference points are at the same image position.")
    if len({tuple(p) for p in w.tolist()}) < len(w):
        raise CalibrationError("Two reference points have the same real-world position.")
    for pts, what in ((a, "image"), (w, "real-world")):
        c = pts - pts.mean(0)
        if np.linalg.svd(c, compute_uv=False)[-1] < 1e-6 * max(1.0, np.abs(c).max()):
            raise CalibrationError(f"The {what} reference points lie in a straight line; spread them over the area.")
    # the matching must keep the same handedness for every triple of points: a swapped pair (a bow-tie) or a wrongly matched landmark folds the mapping
    rel = set()
    n = len(a)
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                ai = (a[j, 0] - a[i, 0]) * (a[k, 1] - a[i, 1]) - (a[j, 1] - a[i, 1]) * (a[k, 0] - a[i, 0])
                wi = (w[j, 0] - w[i, 0]) * (w[k, 1] - w[i, 1]) - (w[j, 1] - w[i, 1]) * (w[k, 0] - w[i, 0])
                if abs(ai) > 1e-6 * max(1.0, np.ptp(a)) ** 2 and abs(wi) > 1e-9:
                    rel.add(ai > 0) if wi > 0 else rel.add(ai < 0)
    if len(rel) > 1:
        raise CalibrationError("These points do not fit together: the click order or the matched landmarks look wrong (two points seem swapped, so the mapping would fold the area). Check the order and try again.")
    H, _ = cv2.findHomography(a, w, 0)
    if H is None or not np.isfinite(H).all() or abs(np.linalg.det(H)) < 1e-12:
        raise CalibrationError("The reference points do not give a usable mapping. Check that they are in the right order.")
    proj = project(H, a)
    err = np.linalg.norm(proj - w, axis=1)
    return H, {"points": len(a), "rms_error_m": round(float(np.sqrt((err**2).mean())), 3), "max_error_m": round(float(err.max()), 3)}


def project(H: np.ndarray, pts) -> np.ndarray:
    p = np.array(pts, np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(p, H).reshape(-1, 2)


def _samples(an: Analysis, tid: int) -> list[dict]:
    return an.tracks.get(tid, [])


def track_summary(an: Analysis) -> list[dict]:
    out = []
    for tid, s in sorted(an.tracks.items()):
        out.append({"id": tid, "first_t": s[0]["t"], "last_t": s[-1]["t"], "observations": len(s), "observed_s": round(len(s) / max(an.effective_fps, 1e-9), 2),
                    "mean_score": round(sum(x["score"] for x in s) / len(s), 3)})
    return out


# ---------------------------------------------------------------------------------------------------------------- restaurant
def presence_events(an: Analysis, poly: list[list[float]], min_stay_s: float, merge_gap_s: float, min_obs: int) -> dict:
    """Entry / exit / duration of every tracked person in the area. A short absence from the area (merge_gap_s) does not end an event.
    An event whose entry or exit was not observed (the track started or ended inside the area, or the video range ended) is labelled incomplete."""
    dt = 1.0 / max(an.effective_fps, 1e-9)
    t_first, t_last = (an.times[0], an.times[-1]) if an.times else (0.0, 0.0)
    gap_break = max(2.5 * dt, merge_gap_s)  # a missing observation this long ends the observation window of the event
    events, ignored = [], 0
    for tid, s in sorted(an.tracks.items()):
        flags = [inside(poly, foot(x["box"])) for x in s]
        runs: list[list[int]] = []
        for i, f in enumerate(flags):
            if not f:
                continue
            if runs:
                last = runs[-1][1]
                limit = gap_break if last == i - 1 else merge_gap_s  # a short excursion outside the area does not end the event
                if s[i]["t"] - s[last]["t"] <= limit:
                    runs[-1][1] = i
                    continue
            runs.append([i, i])
        for a, b in runs:
            n = sum(flags[a:b + 1])
            if n < min_obs:
                ignored += 1
                continue
            t0, t1 = s[a]["t"], s[b]["t"]
            # the entry was seen only if the same track was observed outside the area just before; the exit only if it was observed outside just after
            entry_seen = a > 0 and not flags[a - 1]
            exit_seen = b < len(s) - 1 and not flags[b + 1]
            dur = round(t1 - t0, 2)
            incomplete = [] if entry_seen and exit_seen else (["entry not observed"] if not entry_seen else []) + (["exit not observed"] if not exit_seen else [])
            events.append({
                "track_id": tid, "entry_t": round(t0, 2), "exit_t": round(t1, 2), "duration_s": dur, "observations": int(n),
                "entry_observed": bool(entry_seen), "exit_observed": bool(exit_seen), "complete": not incomplete,
                "status": "Complete observation" if not incomplete else "Incomplete observation: " + ", ".join(incomplete),
                "flag": "Potential Extended Area Presence" if dur >= min_stay_s else None,
                "flag_note": None if dur < min_stay_s else ("Observed presence of at least this length. This is a threshold flag for human review, not a conclusion about what the person was doing." if incomplete else "Observed presence reached the threshold. This is a flag for human review, not a conclusion about what the person was doing."),
            })
    events.sort(key=lambda e: (e["entry_t"], e["track_id"]))
    return {"events": events, "ignored_short_events": ignored, "threshold_s": min_stay_s, "merge_gap_s": merge_gap_s,
            "summary": {"events": len(events), "tracks_in_area": len({e["track_id"] for e in events}), "flagged": sum(1 for e in events if e["flag"]), "incomplete": sum(1 for e in events if not e["complete"]),
                        "observed_area_seconds": round(sum(e["duration_s"] for e in events), 1)}}


def occupancy(an: Analysis, poly: list[list[float]], bin_s: float = 5.0) -> list[dict]:
    if not an.times:
        return []
    t0, t1 = an.times[0], an.times[-1]
    nb = max(1, int(math.ceil((t1 - t0 + 1e-9) / bin_s)))
    peak = [0] * nb
    for f in an.frames:
        n = sum(1 for p in f["persons"] if inside(poly, foot(p["box"])))
        b = min(nb - 1, int((f["t"] - t0) // bin_s))
        peak[b] = max(peak[b], n)
    return [{"t": round(t0 + i * bin_s, 2), "max_people_in_area": v} for i, v in enumerate(peak)]


def _hms(s: str) -> float:
    h, m, *r = (int(x) for x in s.split(":"))
    return h * 3600 + m * 60 + (r[0] if r else 0)


def attendance(events: list[dict], employees: list[dict], links: dict[str, str], clock_start: str, video_start_s: float, video_end_s: float, tolerance_min: float = 10.0) -> dict:
    """Compares area presence observed in the video with a SIMULATED, fictional schedule. Track-to-employee links are made by a person (no recognition).
    Results are 'consistent' or 'discrepancy' only where the video can show it, otherwise 'Insufficient Data'."""
    try:
        c0 = _hms(clock_start)
    except (ValueError, TypeError):
        raise CalibrationError("The video clock start must look like HH:MM or HH:MM:SS.") from None
    by_emp: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        emp = links.get(str(e["track_id"]))
        if emp:
            by_emp[emp].append(e)
    v0, v1 = c0 + video_start_s, c0 + video_end_s
    rows = []
    for emp in employees:
        try:
            s0, s1 = _hms(emp["shift_start"]), _hms(emp["shift_end"])
        except (ValueError, TypeError, KeyError):
            raise CalibrationError(f"Employee {emp.get('name', '?')} has an invalid shift time.") from None
        ev = by_emp.get(emp["id"], [])
        o0, o1 = max(s0, v0), min(s1, v1)
        covered = max(0.0, o1 - o0)
        pres = [(c0 + e["entry_t"], c0 + e["exit_t"], e) for e in ev]
        inside_s = sum(max(0.0, min(b, s1) - max(a, s0)) for a, b, _ in pres)
        outside = [e for a, b, e in pres if b < s0 - tolerance_min * 60 or a > s1 + tolerance_min * 60]
        incomplete = any(not e["complete"] for e in ev)
        if not ev and not any(emp["id"] == v for v in links.values()):
            status, why = "Insufficient Data", "No track has been linked to this person, so nothing can be compared."
        elif covered <= 0:
            status, why = "Insufficient Data", "The analysed video does not overlap this person's scheduled shift."
        elif outside:
            status, why = "Discrepancy: observed outside the scheduled shift", f"{len(outside)} presence event(s) in the area fall outside the shift (± {tolerance_min:g} min)."
        elif not ev:
            status, why = "Not observed in the monitored area", "The linked track(s) were not inside the area during the analysed part of the shift. This cannot show where the person was."
        elif incomplete:
            status, why = "Insufficient Data", "The linked presence events are incomplete (entry or exit not observed), so the times are not reliable."
        else:
            status, why = "Consistent with the schedule", "All observed presence in the area falls within the scheduled shift."
        rows.append({"employee_id": emp["id"], "name": emp["name"], "role": emp.get("role", ""), "shift": f'{emp["shift_start"]}–{emp["shift_end"]}', "linked_tracks": sorted({e["track_id"] for e in ev}),
                     "shift_seconds_covered_by_video": round(covered), "observed_in_area_within_shift_s": round(inside_s, 1), "events": len(ev), "status": status, "explanation": why})
    unlinked = sorted({e["track_id"] for e in events if not links.get(str(e["track_id"]))})
    return {"rows": rows, "unlinked_tracks": unlinked, "video_clock": {"start": clock_start, "analysed_from_s": video_start_s, "analysed_to_s": video_end_s},
            "note": "Schedule data is simulated and fictional. Track links are entered manually; the system does not recognise people. A mismatch is a prompt for a human to review, not a finding about anyone."}


# ---------------------------------------------------------------------------------------------------------------- ball sports
def segments(points: list[dict], gap_s: float, min_len_s: float, min_points: int) -> list[list[dict]]:
    out, cur = [], []
    for p in points:
        if cur and p["t"] - cur[-1]["t"] > gap_s:
            out.append(cur)
            cur = []
        cur.append(p)
    if cur:
        out.append(cur)
    return [s for s in out if len(s) >= min_points and s[-1]["t"] - s[0]["t"] >= min_len_s]


def table_tennis(an: Analysis, corners: list[list[float]], gap_s: float, min_len_s: float, min_points: int = 4) -> dict:
    """Ball-visible segments, bounce and net-side-crossing candidates on the table plane. A calibrated table plane maps the TABLE SURFACE; a ball in flight is above it,
    so its table-plane position is a projection (parallax) and speeds derived from it are approximate."""
    H, cal = fit_homography(corners, [[0, 0], [TABLE_L, 0], [TABLE_L, TABLE_W], [0, TABLE_W]])
    if cal["rms_error_m"] > 0.02:
        cal["warning"] = "The corners fit the table poorly; check that you clicked the table top corners in the order left-near, right-near, right-far, left-far."
    pts = an.ball_points
    world = project(H, [[p["x"], p["y"]] for p in pts]) if pts else np.zeros((0, 2))
    segs = []
    for si, seg in enumerate(segments(pts, gap_s, min_len_s, min_points), 1):
        w = project(H, [[p["x"], p["y"]] for p in seg])
        speeds = [float(np.linalg.norm(w[i + 1] - w[i]) / (seg[i + 1]["t"] - seg[i]["t"])) for i in range(len(seg) - 1) if 0 < seg[i + 1]["t"] - seg[i]["t"] <= gap_s]
        net = TABLE_L / 2
        side = [1 if x > net else -1 for x, _ in w]
        crossings = sum(1 for i in range(len(side) - 1) if side[i] != side[i + 1])
        ys = [p["y"] for p in seg]
        bounces = [{"t": seg[i]["t"], "table_x_m": round(float(w[i][0]), 2), "table_y_m": round(float(w[i][1]), 2), "half": "right" if w[i][0] > net else "left"}
                   for i in range(1, len(seg) - 1) if ys[i] >= ys[i - 1] and ys[i] > ys[i + 1] and ys[i] - min(ys[i - 1], ys[i + 1]) > 1.5]
        segs.append({"index": si, "label": "Ball-visible segment (experimental)", "start_t": seg[0]["t"], "end_t": seg[-1]["t"], "duration_s": round(seg[-1]["t"] - seg[0]["t"], 2), "ball_points": len(seg),
                     "net_side_crossings": crossings, "bounce_candidates": bounces, "max_table_plane_speed_ms": round(max(speeds), 2) if speeds else None,
                     "median_table_plane_speed_ms": round(float(np.median(speeds)), 2) if speeds else None})
    visible = len(pts)
    span = max(1, len(an.times))
    players = [t for t in track_summary(an)]
    players.sort(key=lambda t: -t["observed_s"])
    return {"calibration": cal, "segments": segs, "ball": {"detected_points": visible, "analysed_frames": span, "visibility_pct": round(100.0 * visible / span, 1),
            "note": "Frames without a detected ball are gaps, not estimates. Segment boundaries are where the ball was not detected for longer than the gap setting, which is not necessarily where a rally started or ended."},
            "players": players[:6], "table_plane_points": [{"t": p["t"], "x_m": round(float(w[0]), 3), "y_m": round(float(w[1]), 3), "src": p["src"]} for p, w in zip(pts, world)][:3000]}


def basketball(an: Analysis, img_pts: list[list[float]], world_pts: list[list[float]], cell_m: float, track_ids: list[int] | None, min_poss_s: float, margin_frac: float, max_speed_ms: float = 11.0) -> dict:
    """Court mapping from manual reference points; player positions from the foot point of each person box; heat map from real tracks (seconds per cell);
    possession candidates are a geometric rule (ball inside a person's box for a minimum time), not a rules-aware possession decision."""
    H, cal = fit_homography(img_pts, world_pts)
    if cal["rms_error_m"] > 0.75:
        cal["warning"] = "The reference points fit poorly (error above 0.75 m). Re-check the landmarks you matched; results may be unreliable."
    dt = 1.0 / max(an.effective_fps, 1e-9)
    nx, ny = int(math.ceil(COURT_L / cell_m)), int(math.ceil(COURT_W / cell_m))
    heat = np.zeros((ny, nx))
    per_track: dict[int, dict] = {}
    outside = 0
    for tid, s in an.tracks.items():
        if track_ids and tid not in track_ids:
            continue
        wp = project(H, [foot(x["box"]) for x in s])
        dist, jumps, last = 0.0, 0, None
        n_in = 0
        for x, (X, Y) in zip(s, wp):
            ok = -1.0 <= X <= COURT_L + 1 and -1.0 <= Y <= COURT_W + 1
            if not ok:
                outside += 1
                last = None
                continue
            n_in += 1
            heat[min(ny - 1, max(0, int(Y // cell_m))), min(nx - 1, max(0, int(X // cell_m)))] += dt
            if last is not None and 0 < x["t"] - last[0] <= 2.5 * dt + 0.01:
                step = math.hypot(X - last[1], Y - last[2])
                if step / (x["t"] - last[0]) > max_speed_ms:
                    jumps += 1
                else:
                    dist += step
            last = (x["t"], X, Y)
        if n_in:
            per_track[tid] = {"id": tid, "observations_on_court": n_in, "seconds_on_court": round(n_in * dt, 1), "distance_m": round(dist, 1), "implausible_jumps_excluded": jumps}
    # ball and possession
    bw = project(H, [[p["x"], p["y"]] for p in an.ball_points]) if an.ball_points else np.zeros((0, 2))
    ball_by_t = {p["t"]: p for p in an.ball_points}
    holder_by_t: dict[float, int] = {}
    for f in an.frames:
        b = ball_by_t.get(f["t"])
        if not b:
            continue
        best, bd = None, 1e18
        for p in f["persons"]:
            if track_ids and p["id"] not in track_ids:
                continue
            x0, y0, x1, y1 = p["box"]
            m = margin_frac * (y1 - y0)
            if x0 - m <= b["x"] <= x1 + m and y0 - m <= b["y"] <= y1 + m:
                d = math.hypot(b["x"] - (x0 + x1) / 2, b["y"] - (y0 + y1) / 2)
                if d < bd:
                    best, bd = p["id"], d
        if best is not None:
            holder_by_t[f["t"]] = best
    events, cur = [], None
    for f in an.frames:
        h = holder_by_t.get(f["t"])
        if cur and h == cur["track_id"] and f["t"] - cur["end"] <= 2.5 * dt + 0.01:
            cur["end"], cur["n"] = f["t"], cur["n"] + 1
        else:
            if cur:
                events.append(cur)
            cur = {"track_id": h, "start": f["t"], "end": f["t"], "n": 1} if h is not None else None
    if cur:
        events.append(cur)
    poss = [{"track_id": e["track_id"], "start_t": e["start"], "end_t": e["end"], "duration_s": round(e["end"] - e["start"] + dt, 2), "observations": e["n"], "label": "Potential Possession Event",
             "confidence": "low" if e["n"] < 3 else "medium"} for e in events if e["end"] - e["start"] + dt >= min_poss_s]
    for a, b in zip(poss, poss[1:]):
        b["follows_track"] = a["track_id"] if a["track_id"] != b["track_id"] and b["start_t"] - a["end_t"] <= 2.0 else None
    return {"calibration": cal, "heatmap": {"cell_m": cell_m, "cols": nx, "rows": ny, "seconds": [[round(float(v), 2) for v in r] for r in heat], "court_m": [COURT_L, COURT_W],
            "note": "Seconds each cell was occupied by a tracked person's feet, summed over the selected tracks. Only observed time is counted."},
            "players": sorted(per_track.values(), key=lambda p: -p["seconds_on_court"]), "outside_court_observations": outside,
            "possession": poss, "possession_note": "Potential Possession Events are a geometric rule: the detected ball lies inside one person's box (plus a margin) for the minimum time. Dribbling, passes, loose balls and occlusion are not distinguished.",
            "ball": {"detected_points": len(an.ball_points), "on_court_plane": [{"t": p["t"], "x_m": round(float(w[0]), 2), "y_m": round(float(w[1]), 2)} for p, w in zip(an.ball_points, bw)][:3000],
                     "note": "A ball in the air is above the court plane, so its mapped position is a projection and can fall outside the court."}}
