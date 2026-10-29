"""Document search over a small per-session index. Three honest modes:
  semantic - cosine similarity of passage and query embeddings, each the IDF-weighted mean of pre-trained word vectors (spaCy en_core_web_md, 300-d, MIT);
  keyword  - BM25 over the same passages;
  hybrid   - min-max-normalised sum of both.
Static word vectors capture word meaning, not sentence structure: negation, word order and rare terms are not understood."""
from __future__ import annotations

import json
import math
import re
import time
from collections import Counter
from pathlib import Path

import numpy as np

STOP = set("a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those not no do does did have has had will would can could should may might i you he she we they them his her their our your my me us there here than then so such into over under about after before between also just more most other some any each".split())
TOKEN = re.compile(r"[a-z][a-z'-]*[a-z]|[a-z]")


class WordVectors:
    def __init__(self, d: Path):
        self.vec = np.load(d / "vectors.npy").astype(np.float32)
        self.w2r = json.loads((d / "word2row.json").read_text())

    def row(self, w: str) -> int | None:
        return self.w2r.get(w)


def tokens(text: str) -> list[str]:
    return TOKEN.findall(text.lower())


def chunks(text: str, target: int = 70, overlap: int = 15) -> list[str]:
    """Passages of roughly `target` words that end at sentence boundaries, with a short overlap."""
    text = re.sub(r"[ \t]+", " ", text.replace("\r", ""))
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n{2,}|\n(?=[#\-*] )", text) if s.strip()]
    out, cur, n = [], [], 0
    for s in sents:
        w = len(s.split())
        if cur and n + w > target:
            out.append(" ".join(cur))
            keep: list[str] = []
            m = 0
            for t in reversed(cur):
                m += len(t.split())
                keep.insert(0, t)
                if m >= overlap:
                    break
            cur, n = keep, sum(len(t.split()) for t in keep)
        cur.append(s)
        n += w
    if cur:
        out.append(" ".join(cur))
    return [c for c in out if len(c.split()) >= 4]


class Index:
    def __init__(self, wv: WordVectors):
        self.wv, self.docs, self.touched = wv, {}, time.time()

    def add(self, name: str, text: str, source: str) -> dict:
        ch = chunks(text)
        if not ch:
            raise ValueError("No searchable text was found in this document.")
        did = f"d{len(self.docs) + 1}-{abs(hash(name)) % 10000}"
        self.docs[did] = {"id": did, "name": name, "source": source, "chars": len(text), "passages": [{"n": i + 1, "text": c, "tokens": [t for t in tokens(c) if t not in STOP]} for i, c in enumerate(ch)]}
        self.touched = time.time()
        return self.summary(did)

    def summary(self, did: str) -> dict:
        d = self.docs[did]
        toks = [t for p in d["passages"] for t in p["tokens"]]
        known = sum(1 for t in toks if self.wv.row(t) is not None)
        return {"id": did, "name": d["name"], "source": d["source"], "characters": d["chars"], "passages": len(d["passages"]), "terms": len(toks), "terms_with_vectors": known}

    def remove(self, did: str) -> bool:
        self.touched = time.time()
        return self.docs.pop(did, None) is not None

    def _all(self):
        return [(d["id"], d["name"], p) for d in self.docs.values() for p in d["passages"]]

    def search(self, query: str, mode: str, k: int, alpha: float = 0.5) -> dict:
        self.touched = time.time()
        q = [t for t in tokens(query) if t not in STOP]
        if not q:
            raise ValueError("The query has no searchable words (only stop words or symbols).")
        items = self._all()
        if not items:
            return {"results": [], "query_terms": q, "query_terms_with_vectors": [t for t in q if self.wv.row(t) is not None], "mode": mode}
        N = len(items)
        df = Counter(t for _, _, p in items for t in set(p["tokens"]))
        idf = lambda t: math.log(1 + (N - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))  # noqa: E731
        avg = np.mean([len(p["tokens"]) for _, _, p in items]) or 1.0
        bm = np.zeros(N)
        for i, (_, _, p) in enumerate(items):
            tf = Counter(p["tokens"])
            for t in set(q):
                if t in tf:
                    bm[i] += idf(t) * tf[t] * 2.2 / (tf[t] + 1.2 * (0.25 + 0.75 * len(p["tokens"]) / avg))

        def emb(ts: list[str], weight) -> np.ndarray | None:
            acc = np.zeros(self.wv.vec.shape[1], np.float32)
            wsum = 0.0
            for t in ts:
                r = self.wv.row(t)
                if r is not None:
                    w = weight(t)
                    acc += w * self.wv.vec[r]
                    wsum += w
            return None if wsum == 0 else acc / (np.linalg.norm(acc) + 1e-9)

        qe = emb(q, idf)
        sem = np.zeros(N)
        if qe is not None:
            for i, (_, _, p) in enumerate(items):
                pe = emb(p["tokens"], idf)
                sem[i] = float(pe @ qe) if pe is not None else 0.0
        notes = []
        if qe is None and mode != "keyword":
            notes.append("None of the query words has a word vector, so the semantic score is zero; try different words or keyword mode.")

        def norm(x: np.ndarray) -> np.ndarray:
            lo, hi = x.min(), x.max()
            return (x - lo) / (hi - lo) if hi > lo else np.zeros_like(x)
        score = sem if mode == "semantic" else bm if mode == "keyword" else alpha * norm(sem) + (1 - alpha) * norm(bm)
        order = np.argsort(-score)[:k]
        qs = set(q)
        res = []
        for i in order:
            did, name, p = items[i]
            if mode == "keyword" and bm[i] <= 0:
                continue
            res.append({"doc_id": did, "document": name, "passage": p["n"], "text": p["text"], "score": float(score[i]), "semantic_similarity": float(sem[i]), "bm25": float(bm[i]), "matching_words": sorted(qs & set(p["tokens"]))})
        return {"results": res, "mode": mode, "alpha": alpha if mode == "hybrid" else None, "query_terms": q, "query_terms_with_vectors": [t for t in q if self.wv.row(t) is not None], "notes": notes, "passages_searched": N}
