"""Sensor anomaly detection: a rolling robust z-score and Isolation Forest, with optional scoring against labelled faults."""
from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import HTTPException
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


def _events(flag: np.ndarray, gap: int) -> list[tuple[int, int]]:
    out, i, n = [], 0, len(flag)
    while i < n:
        if flag[i]:
            j, last = i, i
            while j + 1 < n and (flag[j + 1] or j + 1 - last <= gap):
                j += 1
                if flag[j]:
                    last = j
            out.append((i, last))
            i = last + 1
        else:
            i += 1
    return out


def rolling_z(x: np.ndarray, window: int) -> np.ndarray:
    """Robust z-score of each value against the median and MAD of the *preceding* window (so a fault does not hide itself)."""
    s = pd.Series(x)
    med = s.shift(1).rolling(window, min_periods=max(5, window // 4)).median()
    mad = (s.shift(1) - med).abs().rolling(window, min_periods=max(5, window // 4)).median()
    z = 0.6745 * (s - med) / mad.replace(0, np.nan)
    return z.fillna(0).to_numpy()


def run(df: pd.DataFrame, time_col: str, sensors: list[str], method: str, window: int, z_thr: float, contamination: float, label_col: str | None, baseline_fraction: float = 0.25) -> dict:
    n = len(df)
    if n < max(30, window + 5):
        raise HTTPException(422, f"At least {max(30, window + 5)} rows are needed for a window of {window}.")
    X = df[sensors].astype(float)
    nmiss = int(X.isna().sum().sum())
    notes = []
    if nmiss:
        X = X.interpolate(limit_direction="both")
        notes.append(f"{nmiss} missing value(s) were filled by linear interpolation before detection.")
    flags: dict[str, np.ndarray] = {}
    detail: dict[str, dict] = {}
    if method in ("baseline", "all"):
        nb = max(20, int(n * baseline_fraction))
        f = np.zeros(n, bool)
        for c in sensors:
            ref = X[c].to_numpy()[:nb]
            med = np.median(ref)
            mad = np.median(np.abs(ref - med)) or 1e-9
            f |= np.abs(0.6745 * (X[c].to_numpy() - med) / mad) >= z_thr
        flags["baseline"] = f
    if method in ("zscore", "all"):
        zs = {c: rolling_z(X[c].to_numpy(), window) for c in sensors}
        f = np.zeros(n, bool)
        for c, z in zs.items():
            fc = np.abs(z) >= z_thr
            f |= fc
            detail[c] = {"z_flagged": int(fc.sum()), "max_abs_z": float(np.abs(z).max())}
        flags["zscore"] = f
    if method in ("iforest", "all"):
        feats = [X[c].to_numpy() for c in sensors]
        for c in sensors:  # add rolling means/stds so the model sees short-term behaviour, not only levels
            s = X[c]
            feats += [s.rolling(window, min_periods=1).mean().to_numpy(), s.rolling(window, min_periods=2).std().fillna(0).to_numpy()]
        F = StandardScaler().fit_transform(np.column_stack(feats))
        m = IsolationForest(n_estimators=200, contamination=contamination, random_state=0).fit(F)
        flags["iforest"] = m.predict(F) == -1
        iso_score = -m.score_samples(F)
    out_methods = {}
    for k, f in flags.items():
        ev = _events(f, gap=max(1, window // 10))
        out_methods[k] = {"flagged_points": int(f.sum()), "events": [{"start": int(a), "end": int(b), "points": int(f[a:b + 1].sum())} for a, b in ev]}
    res: dict = {"rows": n, "sensors": sensors, "methods": out_methods, "sensor_detail": detail, "notes": notes,
                 "series": {c: [float(v) for v in X[c]] for c in sensors}, "time": [str(t) for t in df[time_col]] if time_col else list(range(n)),
                 "flags": {k: np.flatnonzero(f).tolist() for k, f in flags.items()},
                 "params": {"method": method, "window": window, "z_threshold": z_thr, "contamination": contamination, "baseline_fraction": baseline_fraction}}
    if "iforest" in flags:
        res["iforest_score"] = [round(float(v), 4) for v in iso_score]
    if label_col:
        lab = pd.to_numeric(df[label_col], errors="coerce").fillna(0).to_numpy() > 0
        ev_true = _events(lab, gap=2)
        ev = {}
        for k, f in flags.items():
            tp, fp, fn = int((f & lab).sum()), int((f & ~lab).sum()), int((~f & lab).sum())
            hit = sum(1 for a, b in ev_true if f[a:b + 1].any())
            pr, rc = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
            ev[k] = {"point_precision": pr, "point_recall": rc, "point_f1": 2 * pr * rc / max(pr + rc, 1e-9), "labelled_events": len(ev_true), "labelled_events_detected": hit, "flagged_points_outside_labelled_faults": fp}
        res["evaluation"] = {"label_column": label_col, "labelled_points": int(lab.sum()), "scores": ev,
                             "note": "Scored against the labels in your file. For the bundled dataset the labels are the faults injected when the data was generated."}
    res["limitations"] = ["A statistical anomaly is an unusual reading, not a confirmed fault; normal operating changes (load, season, maintenance) also cause them.", "Rolling z-score judges each sensor against its own recent past (so it adapts to, and then misses, sustained faults and flat lines); the baseline method judges it against the first part of the data, assumed healthy;  Isolation Forest scores combinations of sensors and recent behaviour. None of them knows the machine.",
                          "Thresholds are your choice and trade missed anomalies against false alarms; no remaining-useful-life or failure prediction is made."]
    return res
