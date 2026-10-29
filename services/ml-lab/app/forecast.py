"""Time-series forecasting with classical methods and an honest hold-out comparison. Nothing is fabricated: every accuracy figure is computed from the data."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from fastapi import HTTPException
from statsmodels.tsa.holtwinters import ExponentialSmoothing

FREQ = {"D": ("daily", 7), "W": ("weekly", 52), "MS": ("monthly", 12), "QS": ("quarterly", 4), "h": ("hourly", 24), "YS": ("yearly", 0), "min": ("minutely", 60)}
METHODS = {
    "naive": "Repeat the last observed value.",
    "seasonal_naive": "Repeat the values from the previous season.",
    "holt": "Holt linear trend exponential smoothing (damped), no seasonality.",
    "holt_winters": "Holt-Winters additive trend and additive seasonality (damped trend).",
}


def infer_freq(idx: pd.DatetimeIndex) -> tuple[str, pd.Timedelta]:
    d = pd.Series(idx).diff().dropna()
    med = d.median()
    if med <= pd.Timedelta(0):
        raise HTTPException(422, "The timestamps do not increase.")
    for code, lo, hi in (("min", 55, 65), ("h", 3500, 3700), ("D", 82800, 90000), ("W", 6 * 86400, 8 * 86400), ("MS", 27 * 86400, 32 * 86400), ("QS", 88 * 86400, 93 * 86400), ("YS", 360 * 86400, 370 * 86400)):
        if lo <= med.total_seconds() <= hi:
            return code, med
    raise HTTPException(422, f"The time steps are irregular (median {med}); the demo supports minutely, hourly, daily, weekly, monthly, quarterly or yearly data.")


def _fit_predict(method: str, y: np.ndarray, h: int, m: int) -> np.ndarray:
    if method == "naive":
        return np.repeat(y[-1], h)
    if method == "seasonal_naive":
        if m < 2 or len(y) < m:
            raise ValueError("not enough data for a season")
        return np.array([y[len(y) - m + (i % m)] for i in range(h)])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        if method == "holt":
            fit = ExponentialSmoothing(y, trend="add", damped_trend=True, initialization_method="estimated").fit()
        else:
            if m < 2 or len(y) < 2 * m:
                raise ValueError("needs at least two full seasons")
            fit = ExponentialSmoothing(y, trend="add", damped_trend=True, seasonal="add", seasonal_periods=m, initialization_method="estimated").fit()
        return np.asarray(fit.forecast(h))


def run(df: pd.DataFrame, date_col: str, value_col: str, horizon: int, season: int | None, method: str, max_horizon: int = 365) -> dict:
    if not 1 <= horizon <= max_horizon:
        raise HTTPException(422, f"The horizon must be between 1 and {max_horizon} steps.")
    s = df.set_index(date_col)[value_col].astype(float)
    code, step = infer_freq(s.index)
    full = pd.date_range(s.index[0], s.index[-1], freq=pd.tseries.frequencies.to_offset(code))
    s = s.reindex(full)
    notes: list[str] = []
    missing = int(s.isna().sum())
    if missing > 0.2 * len(s):
        raise HTTPException(422, f"{missing} of {len(s)} time steps have no value; too many gaps to forecast reliably.")
    if missing:
        s = s.interpolate(limit_direction="both")
        notes.append(f"{missing} missing time step(s) were filled by linear interpolation.")
    name, default_m = FREQ[code]
    m = default_m if season is None else season
    if season is None and code == "W" and len(s) < 104:
        m = 0
    if m and len(s) < 2 * m:
        notes.append(f"Only {len(s)} points for a season of {m}: seasonal methods are unavailable.")
    y = s.to_numpy()
    if len(y) < 12:
        raise HTTPException(422, "At least 12 observations are needed.")
    ho = int(min(max(horizon, 3), max(3, len(y) // 4)))
    train, test = y[:-ho], y[-ho:]
    table = []
    for k in METHODS:
        if method != "auto" and method != k:
            continue
        try:
            p = _fit_predict(k, train, ho, m)
            err = test - p
            nz = np.abs(test) > 1e-9
            table.append({"method": k, "description": METHODS[k], "holdout_points": ho, "mae": float(np.mean(np.abs(err))), "rmse": float(np.sqrt(np.mean(err ** 2))),
                          "mape_percent": float(np.mean(np.abs(err[nz] / test[nz])) * 100) if nz.any() else None, "predictions": p.tolist()})
        except (ValueError, np.linalg.LinAlgError, FloatingPointError) as e:
            table.append({"method": k, "description": METHODS[k], "unavailable": str(e)})
    ok = [t for t in table if "mae" in t]
    if not ok:
        raise HTTPException(422, "No method could be fitted to this series.")
    best = min(ok, key=lambda t: t["mae"])
    fc = _fit_predict(best["method"], y, horizon, m)
    resid = test - np.asarray(best["predictions"])
    sigma = float(np.std(resid, ddof=1)) if len(resid) >= 5 else None
    future = pd.date_range(s.index[-1], periods=horizon + 1, freq=pd.tseries.frequencies.to_offset(code))[1:]
    iso = lambda ix: [t.isoformat() for t in ix]  # noqa: E731
    return {"frequency": name, "season_length": m or None, "n_observations": int(len(y)), "method": best["method"], "method_description": METHODS[best["method"]],
            "selected_by": "lowest mean absolute error on the last %d observations, which were held out of fitting" % ho if method == "auto" else "chosen by the user",
            "history": {"t": iso(s.index), "y": [float(v) for v in y]},
            "holdout": {"t": iso(s.index[-ho:]), "actual": test.tolist(), "predicted": best["predictions"]},
            "forecast": {"t": iso(future), "mean": [float(v) for v in fc],
                         "lower": None if sigma is None else [float(v - 1.96 * sigma) for v in fc], "upper": None if sigma is None else [float(v + 1.96 * sigma) for v in fc]},
            "interval_note": "Approximate 95% band: +/-1.96 times the standard deviation of the hold-out errors. It assumes errors of similar size in the future, roughly normal and unbiased, and understates uncertainty for long horizons." if sigma is not None else "Fewer than 5 hold-out points: no interval is shown.",
            "methods": [{k: v for k, v in t.items() if k != "predictions"} for t in table], "notes": notes,
            "limitations": ["A statistical extrapolation of the series' own past: it knows nothing about events, prices, promotions or anything outside the data.", "Accuracy figures come from a single hold-out window and may not hold for the future.", "Strong structural change, outliers and short series make every method unreliable."]}
