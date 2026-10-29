"""Content-based similarity over a product catalogue: image embeddings (MobileNetV2 penultimate layer) and TF-IDF of product text, with a user-set blend."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

ATTRS = ("category", "brand", "colour", "material")


class Catalogue:
    def __init__(self, folder: Path, classifier):
        self.items = json.loads((folder / "items.json").read_text())
        self.folder = folder
        self.by_id = {i["id"]: n for n, i in enumerate(self.items)}
        imgs = []
        for it in self.items:
            im = cv2.imread(str(folder / it["image"]))
            imgs.append(classifier.embed(cv2.resize(im, (224, 224), interpolation=cv2.INTER_CUBIC)))
        self.img = np.stack(imgs)
        self.vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True, min_df=1)
        docs = [" ".join([i["name"], i["category"], i["brand"], i["colour"], i["material"], i["description"]]) for i in self.items]
        self.tx = self.vec.fit_transform(docs)
        self.terms = np.array(self.vec.get_feature_names_out())

    def listing(self, q: str, category: str | None, limit: int) -> list[dict]:
        ql = q.lower().strip()
        out = [i for i in self.items if (not category or i["category"] == category) and (not ql or ql in " ".join([i["name"], i["category"], i["brand"], i["colour"], i["material"]]).lower())]
        return out[:limit]

    def similar(self, pid: str, k: int, image_weight: float) -> dict:
        n = self.by_id[pid]
        img = self.img @ self.img[n]
        txt = (self.tx @ self.tx[n].T).toarray().ravel()
        score = image_weight * img + (1 - image_weight) * txt
        order = [j for j in np.argsort(-score) if j != n][:k]
        base = self.items[n]
        tb = self.tx[n].toarray().ravel()
        res = []
        for j in order:
            it = self.items[j]
            shared = [a for a in ATTRS if it[a] == base[a]]
            tj = self.tx[j].toarray().ravel()
            contrib = tb * tj
            top = [self.terms[t] for t in np.argsort(-contrib)[:4] if contrib[t] > 0]
            res.append({**it, "score": float(score[j]), "image_similarity": float(img[j]), "text_similarity": float(txt[j]), "shared_attributes": shared, "shared_terms": top})
        return {"selected": base, "image_weight": image_weight, "results": res,
                "method": f"score = {image_weight:.2f} x image cosine (MobileNetV2 features) + {1 - image_weight:.2f} x text cosine (TF-IDF of name, category, brand, colour, material and description)"}
