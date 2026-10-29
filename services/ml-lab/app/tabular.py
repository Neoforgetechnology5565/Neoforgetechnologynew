"""CSV reading shared by the forecasting and sensor demos: bounded, validated, and explicit about every problem found."""
from __future__ import annotations

import io

import numpy as np
import pandas as pd
from fastapi import HTTPException


def read_csv(data: bytes, max_rows: int) -> pd.DataFrame:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = data.decode("latin-1")
        except Exception:  # noqa: BLE001
            raise HTTPException(422, "The file is not readable text. Upload a CSV file.") from None
    if "\x00" in text[:2000]:
        raise HTTPException(415, "This looks like a binary file, not a CSV.")
    try:
        df = pd.read_csv(io.StringIO(text), sep=None, engine="python", nrows=max_rows + 1)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "The CSV could not be parsed. Check that it has a header row and consistent columns.") from None
    if len(df) > max_rows:
        raise HTTPException(422, f"The file has more than {max_rows} rows; this demo accepts up to {max_rows}.")
    if df.shape[1] < 2 or len(df) < 3:
        raise HTTPException(422, "The CSV needs at least two columns and three rows.")
    df.columns = [str(c).strip() for c in df.columns]
    if len(set(df.columns)) != len(df.columns):
        raise HTTPException(422, "Column names must be unique.")
    return df


def date_candidates(df: pd.DataFrame) -> list[str]:
    out = []
    for c in df.columns:
        if pd.api.types.is_numeric_dtype(df[c]):
            continue
        p = pd.to_datetime(df[c], errors="coerce", format="mixed")
        if p.notna().mean() >= 0.9:
            out.append(c)
    return out


def numeric_candidates(df: pd.DataFrame, exclude: set[str] = frozenset()) -> list[str]:
    out = []
    for c in df.columns:
        if c in exclude:
            continue
        v = pd.to_numeric(df[c], errors="coerce")
        if v.notna().mean() >= 0.9 and v.nunique() > 1:
            out.append(c)
    return out


def describe(df: pd.DataFrame) -> dict:
    d = date_candidates(df)
    return {"rows": len(df), "columns": list(df.columns), "date_candidates": d, "numeric_candidates": numeric_candidates(df, set(d)),
            "preview": df.head(8).astype(object).where(df.head(8).notna(), None).values.tolist()}


def clean_series(df: pd.DataFrame, date_col: str, cols: list[str]) -> tuple[pd.DataFrame, list[str]]:
    """Parse the date column, coerce the value columns, drop unusable rows and say how many. Raises 422 for anything that makes the data unusable."""
    for c in [date_col, *cols]:
        if c not in df.columns:
            raise HTTPException(422, f"Column '{c}' does not exist.")
    notes: list[str] = []
    t = pd.to_datetime(df[date_col], errors="coerce", format="mixed")
    bad_dates = int(t.isna().sum())
    if bad_dates > 0.1 * len(df):
        raise HTTPException(422, f"{bad_dates} of {len(df)} values in '{date_col}' are not valid dates.")
    out = pd.DataFrame({date_col: t})
    for c in cols:
        out[c] = pd.to_numeric(df[c], errors="coerce")
    bad_vals = int(out[cols].isna().any(axis=1).sum()) - bad_dates
    if bad_dates:
        notes.append(f"{bad_dates} row(s) with an invalid date were dropped.")
    out = out.dropna(subset=[date_col]).sort_values(date_col)
    if bad_vals > 0:
        notes.append(f"{bad_vals} row(s) had a missing or non-numeric value.")
    if out[cols].isna().all().any():
        raise HTTPException(422, "A selected column has no numeric values.")
    dup = int(out[date_col].duplicated().sum())
    if dup:
        notes.append(f"{dup} duplicate timestamp(s) were averaged.")
        out = out.groupby(date_col, as_index=False).mean(numeric_only=True)
    if np.isinf(out[cols].to_numpy(dtype=float)).any():
        raise HTTPException(422, "The values contain infinities.")
    return out.reset_index(drop=True), notes
