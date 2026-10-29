"""Candidate-event heuristics over stored person tracks and pose keypoints. No model is trained here: every rule is explicit and every
alert lists the measured values and the thresholds they were compared with. These are *candidates for human review*, not detections of
falls or violence, and the rules have not been validated on a labelled fall/aggression dataset.

Units: times in seconds of video, lengths in 'torso lengths' (distance between shoulder-midpoint and hip-midpoint in pixels, taken from
upright frames) so thresholds do not depend on resolution; a person's apparent size changes with camera distance and angle.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from .pose import LH, LS, LW, RH, RS, RW

CORE = (LS, RS, LH, RH)


@dataclass
class FallParams:
    min_upright_s: float = 0.6      # person must be upright at least this long before the drop
    window_s: float = 1.5           # upright -> lying must happen within this time
    upright_tilt_deg: float = 35.0  # torso tilt from vertical at or below = upright
    lying_tilt_deg: float = 60.0    # torso tilt at or above = lying / horizontal
    lying_aspect: float = 1.2       # box width/height at or above = lying (used only when the pose is missing or unreliable)
    min_drop_torso: float = 0.6     # hip-midpoint must descend at least this many torso lengths (or box height fall below drop_height_ratio)
    drop_height_ratio: float = 0.6
    min_lying_s: float = 1.0        # must remain low at least this long (or until the track/video ends)
    min_visibility: float = 0.5     # mean visibility of shoulders+hips needed to trust the pose


@dataclass
class AggressionParams:
    max_distance: float = 1.2       # centre distance between two people, in mean box heights
    min_arm_speed: float = 6.0      # wrist speed relative to own hips, torso lengths per second
    min_duration_s: float = 1.0
    min_fraction: float = 0.5       # of the close-contact samples, this share must show fast arm motion
    min_visibility: float = 0.5


@dataclass
class Sample:
    """One person in one analysed frame."""
    t: float
    box: tuple[float, float, float, float]
    score: float
    kp: np.ndarray | None = None  # (33,4) x, y, visibility, presence


@dataclass
class Evidence:
    name: str
    value: float | str | bool | None
    threshold: float | str | None
    met: bool
    note: str = ""


@dataclass
class Candidate:
    kind: str                  # fall | aggression
    tracks: list[int]
    t_start: float
    t_end: float
    t_peak: float
    evidence: list[Evidence] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def public(self) -> dict:
        d = asdict(self)
        d["criteria_met"] = sum(e.met for e in self.evidence if e.threshold is not None)
        d["criteria_total"] = sum(1 for e in self.evidence if e.threshold is not None)
        return d


Track = list[Sample]


def _mid(kp: np.ndarray, a: int, b: int) -> np.ndarray:
    return (kp[a, :2] + kp[b, :2]) / 2


def pose_ok(kp: np.ndarray | None, min_vis: float) -> bool:
    return kp is not None and float(np.mean(kp[list(CORE), 2])) >= min_vis


def torso(kp: np.ndarray) -> tuple[float, float, np.ndarray]:
    """Returns (tilt from vertical in degrees, torso length in px, hip midpoint). 0 = shoulders directly above hips."""
    sh, hp = _mid(kp, LS, RS), _mid(kp, LH, RH)
    v = sh - hp
    length = float(np.hypot(*v))
    tilt = float(np.degrees(np.arctan2(abs(v[0]), -v[1]))) if length > 1e-6 else 0.0  # image y grows downwards: upright => v[1] < 0; shoulders below hips gives > 90
    return tilt, length, hp


def _runs(flags: list[bool], times: list[float], min_len_s: float, max_gap: int = 1) -> list[tuple[int, int]]:
    """Index ranges of True runs that last at least min_len_s, bridging up to max_gap False samples."""
    out, i, n = [], 0, len(flags)
    while i < n:
        if not flags[i]:
            i += 1
            continue
        j, gap, last = i, 0, i
        while j + 1 < n and (flags[j + 1] or gap < max_gap):
            j += 1
            if flags[j]:
                gap, last = 0, j
            else:
                gap += 1
        if times[last] - times[i] >= min_len_s:
            out.append((i, last))
        i = last + 1
    return out


def _states(track: Track, p: FallParams) -> list[dict]:
    rows = []
    for s in track:
        x1, y1, x2, y2 = s.box
        w, h = max(x2 - x1, 1e-6), max(y2 - y1, 1e-6)
        row = {"t": s.t, "h": h, "aspect": w / h, "tilt": None, "len": None, "hip_y": None, "state": "unknown"}
        if pose_ok(s.kp, p.min_visibility):
            tilt, ln, hp = torso(s.kp)
            row.update(tilt=tilt, len=ln, hip_y=float(hp[1]))
            row["state"] = "upright" if tilt <= p.upright_tilt_deg else "lying" if p.lying_tilt_deg <= tilt <= 180 - 0 else "mid"
        if row["state"] == "unknown":  # box shape is only a fallback when the pose is missing or unreliable
            if row["aspect"] >= p.lying_aspect:
                row["state"] = "lying"
            elif row["aspect"] <= 0.8:
                row["state"] = "upright"
                row["by_box"] = True
        rows.append(row)
    return rows


def detect_falls(tracks: dict[int, Track], p: FallParams, video_end: float) -> list[Candidate]:
    out: list[Candidate] = []
    for tid, track in tracks.items():
        if len(track) < 4:
            continue
        rows = _states(track, p)
        times = [r["t"] for r in rows]
        last_alert_t = -1e9
        for k, r in enumerate(rows):
            if r["state"] != "lying" or (k > 0 and rows[k - 1]["state"] == "lying") or r["t"] - last_alert_t < 3.0:
                continue
            # most recent upright sample inside the window, preceded by a sustained upright period
            k0 = next((i for i in range(k - 1, -1, -1) if times[k] - times[i] <= p.window_s and rows[i]["state"] == "upright"), None)
            if k0 is None:
                continue
            before = [x for x in rows[:k0 + 1] if times[k0] - x["t"] <= p.min_upright_s + 1e-6]
            upright_frac = sum(x["state"] == "upright" for x in before) / max(len(before), 1)
            upright_span = times[k0] - before[0]["t"]
            if upright_span < p.min_upright_s * 0.6 or upright_frac < 0.7:
                continue
            # reference scale from the upright period
            lens = [x["len"] for x in before if x["len"]]
            hs = [x["h"] for x in before]
            ref_len, ref_h = (float(np.median(lens)) if lens else None), float(np.median(hs))
            after = [x for x in rows[k:] if x["t"] - times[k] <= p.min_lying_s + 1e-6]
            seg = rows[k0:k + len(after)]  # from the last upright sample through the first min_lying_s of lying
            hips = [x["hip_y"] for x in seg if x["hip_y"] is not None]
            drop = None
            if ref_len and len(hips) >= 2:
                drop = (max(hips[-1], max(hips)) - hips[0]) / ref_len
            height_ratio = float(np.median([x["h"] for x in seg[-3:]]) / ref_h)
            # peak hip descent speed
            speed = None
            if ref_len:
                v = [(b["hip_y"] - a["hip_y"]) / max(b["t"] - a["t"], 1e-3) / ref_len for a, b in zip(seg, seg[1:]) if a["hip_y"] is not None and b["hip_y"] is not None]
                speed = float(max(v)) if v else None
            # lying persistence
            observed = after[-1]["t"] - times[k] if after else 0.0
            lying_frac = sum(x["state"] == "lying" for x in after) / max(len(after), 1)
            tail_end = times[-1] - times[k]
            ended_lying = observed >= tail_end - 1e-6 and rows[-1]["state"] == "lying" and (video_end - times[-1]) < 1.0
            lying_ok = observed >= p.min_lying_s * 0.9 and lying_frac >= 0.7
            drop_ok = (drop is not None and drop >= p.min_drop_torso) or height_ratio <= p.drop_height_ratio
            if not (lying_ok or (ended_lying and lying_frac >= 0.7)) or not drop_ok:
                continue
            recovered = any(x["state"] == "upright" for x in rows[k + len(after):][:int(10)])
            ev = [
                Evidence("Upright before the drop", f"{upright_span:.1f} s", f">= {p.min_upright_s * 0.6:.1f} s", upright_span >= p.min_upright_s * 0.6),
                Evidence("Time from upright to lying", round(times[k] - times[k0], 2), f"<= {p.window_s} s", times[k] - times[k0] <= p.window_s, "seconds between the last upright sample and the first lying sample"),
                Evidence("Drop (hip descent or box height)", f"hips {'n/a' if drop is None else round(drop, 2)} torso lengths; box height ratio {round(height_ratio, 2)}",
                         f"hips >= {p.min_drop_torso} torso lengths or box ratio <= {p.drop_height_ratio}", drop_ok, "either measure may satisfy the rule"),
                Evidence("Stayed low", f"{observed:.1f} s" + (" (video ended while lying)" if ended_lying and not lying_ok else ""), f">= {p.min_lying_s} s", lying_ok, "lying for less than the threshold because the video ended" if not lying_ok else ""),
                Evidence("Peak descent speed", None if speed is None else round(speed, 2), None, True, "torso lengths per second; informational"),
                Evidence("Lying posture at first lying sample", f"torso tilt {'n/a' if r['tilt'] is None else round(r['tilt'])} deg; box width/height {round(r['aspect'], 2)}",
                         f"tilt >= {p.lying_tilt_deg} deg or width/height >= {p.lying_aspect}", bool((r["tilt"] is not None and r["tilt"] >= p.lying_tilt_deg) or r["aspect"] >= p.lying_aspect), "pose tilt, or box shape when pose was unreliable"),
            ]
            notes = []
            if not recovered:
                notes.append("No return to an upright posture was observed in the following samples.")
            if r["tilt"] is None:
                notes.append("Pose was unreliable at the drop; the box shape was used.")
            out.append(Candidate("fall", [tid], times[k0], min(times[k] + max(observed, 0), times[-1]), times[k], ev, notes))
            last_alert_t = times[k]
    return out


def arm_speeds(track: Track, min_vis: float) -> dict[float, float]:
    """Wrist speed relative to the person's own hips (torso lengths/s), keyed by the later sample time."""
    out: dict[float, float] = {}
    prev = None
    for s in track:
        if not pose_ok(s.kp, min_vis):
            prev = None
            continue
        tilt, ln, hp = torso(s.kp)
        if ln < 8:
            prev = None
            continue
        rel = {w: s.kp[w, :2] - hp for w in (LW, RW) if s.kp[w, 2] >= min_vis}
        if prev is not None and s.t > prev[0]:
            best = 0.0
            for w, r in rel.items():
                if w in prev[1]:
                    best = max(best, float(np.hypot(*(r - prev[1][w]))) / (s.t - prev[0]) / ((ln + prev[2]) / 2))
            out[s.t] = best
        prev = (s.t, rel, ln)
    return out


def detect_aggression(tracks: dict[int, Track], p: AggressionParams) -> list[Candidate]:
    speeds = {tid: arm_speeds(tr, p.min_visibility) for tid, tr in tracks.items()}
    by_time = {tid: {s.t: s for s in tr} for tid, tr in tracks.items()}
    ids = sorted(tracks)
    out: list[Candidate] = []
    for ai, a in enumerate(ids):
        for b in ids[ai + 1:]:
            common = sorted(set(by_time[a]) & set(by_time[b]))
            if len(common) < 3:
                continue
            close, fast, dist, spd = [], [], [], []
            for t in common:
                sa, sb = by_time[a][t], by_time[b][t]
                ca = np.array([(sa.box[0] + sa.box[2]) / 2, (sa.box[1] + sa.box[3]) / 2])
                cb = np.array([(sb.box[0] + sb.box[2]) / 2, (sb.box[1] + sb.box[3]) / 2])
                hh = ((sa.box[3] - sa.box[1]) + (sb.box[3] - sb.box[1])) / 2
                d = float(np.hypot(*(ca - cb)) / max(hh, 1e-6))
                v = max(speeds[a].get(t, 0.0), speeds[b].get(t, 0.0))
                dist.append(d); spd.append(v)
                close.append(d <= p.max_distance)
                fast.append(d <= p.max_distance and v >= p.min_arm_speed)
            for i, j in _runs(close, common, p.min_duration_s, 1):
                n_close = sum(close[i:j + 1])
                frac = sum(fast[i:j + 1]) / max(n_close, 1)
                if frac < p.min_fraction:
                    continue
                pk = i + int(np.argmax(spd[i:j + 1]))
                ev = [
                    Evidence("Time in close contact", round(common[j] - common[i], 2), f">= {p.min_duration_s} s", common[j] - common[i] >= p.min_duration_s),
                    Evidence("Closest distance", round(min(dist[i:j + 1]), 2), f"<= {p.max_distance} box heights", min(dist[i:j + 1]) <= p.max_distance, "centre-to-centre, in mean box heights"),
                    Evidence("Samples with fast arm motion", round(frac, 2), f">= {p.min_fraction}", frac >= p.min_fraction, "share of close-contact samples in which a wrist moved faster than the speed threshold, relative to the hips"),
                    Evidence("Peak wrist speed", round(spd[pk], 2), f">= {p.min_arm_speed} torso lengths/s", spd[pk] >= p.min_arm_speed, "relative to the person's own hips"),
                ]
                out.append(Candidate("aggression", [a, b], common[i], common[j], common[pk], ev,
                                     ["Fast arms near another person also occur in dancing, sport, play, hugging and handshakes. Nothing here measures intent or contact."]))
    return out
