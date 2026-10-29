import io
import re
import uuid

import numpy as np

from tests.conftest import SAMPLES, post, up

S1 = uuid.uuid4().hex


def test_ocr_text_pdf_scan_and_tiff(client):
    r = post(client, "/api/ocr", "invoice-text").json()
    assert r["pages"][0]["source"] == "pdf_text_layer" and "INV-2024-0173" in r["pages"][0]["text"] and len(r["pages"]) == 2 and r["ocr"]["mean_confidence"] is None
    f = {(x["type"], x["value"]) for x in r["fields"]}
    assert ("email", "billing@example.com") in f and any(t == "date" and "14 March 2024" in v for t, v in f) and any(t == "amount" and "138.84" in v for t, v in f)
    assert any(x["type"] == "reference" and x["value"] == "INV-2024-0173" for x in r["fields"])
    sc = post(client, "/api/ocr", "invoice-scanned").json()
    assert sc["pages"][0]["source"] == "ocr" and re.sub(r"\s", "", "INV-2024-0173") in re.sub(r"\s", "", sc["pages"][0]["text"]) and 0.6 < sc["ocr"]["mean_confidence"] <= 1
    assert all(0 <= l["confidence"] <= 1 and len(l["bbox"]) == 4 for l in sc["pages"][0]["lines"])
    forced = post(client, "/api/ocr", "invoice-text", force_ocr="true").json()
    assert forced["pages"][0]["source"] == "ocr"
    tif = post(client, "/api/ocr", "scan-tesseract-phototest").json()
    assert "quick brown dog" in tif["pages"][0]["text"] and tif["fields"] == []


def test_ocr_validation_and_blank(client):
    assert client.post("/api/ocr", files=up("a.txt", b"nope")).status_code == 415
    assert client.post("/api/ocr", files=up("a.pdf", b"%PDF-1.4 not really")).status_code == 422
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGB", (400, 300), (255, 255, 255)).save(b, "PNG")
    r = client.post("/api/ocr", files=up("blank.png", b.getvalue())).json()
    assert r["characters"] == 0 and r["pages"][0]["text"] == "" and r["message"] and r["fields"] == []


def test_forecast_on_real_co2_with_real_holdout_scores(client):
    ins = post(client, "/api/tabular/inspect", "co2-monthly").json()
    assert ins["date_candidates"] == ["month"] and ins["numeric_candidates"] == ["co2_ppm"] and ins["rows"] == 526
    r = post(client, "/api/forecast", "co2-monthly", date_column="month", value_column="co2_ppm", horizon="24").json()
    assert r["frequency"] == "monthly" and r["season_length"] == 12 and len(r["forecast"]["mean"]) == 24 and r["forecast"]["t"][0] > r["history"]["t"][-1]
    best = next(m for m in r["methods"] if m["method"] == r["method"])
    assert best["mae"] < 1.5 and best["mape_percent"] < 0.5                   # a clean trend plus season is forecast to within about a ppm on held-out data
    naive = next(m for m in r["methods"] if m["method"] == "naive")
    assert best["mae"] <= naive["mae"] and r["forecast"]["lower"][0] < r["forecast"]["mean"][0] < r["forecast"]["upper"][0]
    assert r["forecast"]["mean"][-1] > r["history"]["y"][-1] - 2                # CO2 kept rising
    assert "single hold-out" in " ".join(r["limitations"]) and "approximate" in r["interval_note"].lower()
    assert next(m for m in r["methods"] if m["method"] == "naive")["description"]
    pick = post(client, "/api/forecast", "co2-monthly", date_column="month", value_column="co2_ppm", horizon="6", method="holt").json()
    assert pick["method"] == "holt" and pick["selected_by"] == "chosen by the user"


def test_forecast_validation(client):
    def csv(text, **kw):
        return client.post("/api/forecast", data={"date_column": "d", "value_column": "v", "horizon": "3", **kw}, files=up("x.csv", text.encode()))
    good = "d,v\n" + "\n".join(f"2024-01-{i:02d},{i * 2.0}" for i in range(1, 29))
    assert csv(good).status_code == 200
    assert csv("d,v\nnot,a\ndate,b\nat,all").status_code == 422
    assert csv("d,v\n2024-01-01,1\n2024-01-02,x\n2024-01-03,y\n2024-01-04,z\n2024-01-05,w\n2024-01-06,q").status_code == 422
    assert csv("d,v\n2024-01-01,1\n2024-01-02,2").status_code == 422                       # too short
    assert csv(good, horizon="0").status_code == 422 and csv(good, horizon="999").status_code == 422
    assert csv(good, value_column="missing").status_code == 422 and csv(good, method="magic").status_code == 400
    irregular = "d,v\n" + "\n".join(f"2024-01-{d:02d},{d}" for d in (1, 2, 4, 9, 11, 20, 21, 27, 28, 30, 31, 3, 5))
    assert csv(irregular.replace("30,30", "30,30")).status_code == 422
    gappy = "d,v\n" + "\n".join(f"2024-01-{i:02d},{i}" for i in list(range(1, 12)) + list(range(15, 29)))
    r = csv(gappy)
    assert r.status_code == 200 and any("interpolation" in n for n in r.json()["notes"])
    assert client.post("/api/forecast", data={"date_column": "d", "value_column": "v"}, files=up("x.png", b"\x89PNG\r\n\x1a\n" + b"0" * 20)).status_code == 415
    assert client.post("/api/forecast", data={"date_column": "d", "value_column": "v"}, files=up("x.csv", b"")).status_code == 400
    assert client.post("/api/forecast", data={"date_column": "d", "value_column": "v"}, files=up("x.csv", b"just one column\n1\n2\n3")).status_code == 422


def test_sensor_anomalies_scored_against_the_injected_faults(client):
    ins = post(client, "/api/tabular/inspect", "pump-sensors-synthetic").json()
    assert ins["date_candidates"] == ["timestamp"] and {"temperature_c", "vibration_mm_s", "pressure_bar"} <= set(ins["numeric_candidates"])
    r = post(client, "/api/sensors", "pump-sensors-synthetic", time_column="timestamp", sensor_columns="temperature_c,vibration_mm_s,pressure_bar", label_column="injected_fault", method="all", window="48", z_threshold="5", contamination="0.03").json()
    ev = r["evaluation"]["scores"]
    assert r["evaluation"]["labelled_points"] > 400 and set(ev) == {"baseline", "zscore", "iforest"}
    assert ev["baseline"]["point_precision"] > 0.9 and ev["baseline"]["point_recall"] > 0.7 and ev["baseline"]["labelled_events"] == 5          # measured: 1.00 / 0.81
    assert ev["zscore"]["labelled_events_detected"] >= 3 and ev["zscore"]["point_recall"] < 0.2                                                     # rolling z adapts to sustained faults: honest weakness
    assert 0 <= ev["iforest"]["point_precision"] <= 1 and ev["baseline"]["labelled_events_detected"] < 5                                           # the stuck sensor (a flat line at a normal value) is missed by value-based rules
    assert all(0 <= i < r["rows"] for v in r["flags"].values() for i in v) and len(r["series"]["temperature_c"]) == r["rows"] == len(r["time"])
    assert "not a confirmed fault" in r["limitations"][0]
    quiet = post(client, "/api/sensors", "pump-sensors-synthetic", sensor_columns="pressure_bar", method="zscore", window="48", z_threshold="20").json()
    assert quiet["methods"]["zscore"]["flagged_points"] <= r["methods"]["zscore"]["flagged_points"] and "evaluation" not in quiet
    assert post(client, "/api/sensors", "pump-sensors-synthetic", sensor_columns="pressure_bar", method="baseline", baseline_fraction="0.01").status_code == 400


def test_sensor_validation(client):
    base = {"sensor_columns": "a", "method": "zscore", "window": "10", "z_threshold": "4", "contamination": "0.02"}
    csv = "t,a\n" + "\n".join(f"2024-01-01 00:{i:02d}:00,{1 + (i % 3) * 0.1}" for i in range(60))
    assert client.post("/api/sensors", data={**base, "time_column": "t"}, files=up("s.csv", csv.encode())).status_code == 200
    assert client.post("/api/sensors", data={**base, "sensor_columns": "zzz"}, files=up("s.csv", csv.encode())).status_code == 422
    assert client.post("/api/sensors", data={**base, "method": "magic"}, files=up("s.csv", csv.encode())).status_code == 400
    assert client.post("/api/sensors", data={**base, "window": "1"}, files=up("s.csv", csv.encode())).status_code == 400
    assert client.post("/api/sensors", data={**base, "window": "500"}, files=up("s.csv", csv.encode())).status_code == 422            # more rows needed than supplied
    bad = "t,a\n" + "\n".join(f"2024-01-01 00:{i:02d}:00,abc" for i in range(60))
    assert client.post("/api/sensors", data=base, files=up("s.csv", bad.encode())).status_code == 422
    assert client.post("/api/sensors", data={**base, "time_column": "a"}, files=up("s.csv", csv.encode())).status_code == 400
    assert client.post("/api/sensors", data={**base, "sensor_columns": "a", "time_column": "t2"}, files=up("s.csv", csv.replace("t,a", "t2,a").encode())).status_code == 200
    assert client.post("/api/sensors", data={**base, "sensor_columns": "t", "time_column": "a"}, files=up("s.csv", csv.encode())).status_code == 422


def add_text(client, text, title="t"):
    return client.post("/api/search/documents", data={"session": S1, "text": text, "title": title})


def test_semantic_search_over_the_projects_own_docs(client):
    client.post("/api/search/reset", data={"session": S1})
    for sid in ("docs-activity-rules", "docs-lidar-measurement", "docs-defects-limitations", "docs-documents-methods"):
        r = client.post("/api/search/documents", data={"session": S1, "sample_id": sid})
        assert r.status_code == 200, r.text
    assert r.json()["terms_with_vectors"] > 0.5 * r.json()["terms"]
    q = lambda text, mode="hybrid": client.post("/api/search/query", data={"session": S1, "query": text, "mode": mode, "k": "3"}).json()  # noqa: E731
    top = q("how are falls detected from body posture")["results"][0]
    assert top["document"].lower().startswith("activity")
    assert "semantic_similarity" in top and "bm25" in top
    # a query with no word in common with the text still ranks by meaning
    syn = q("sag of an overhead power cable", "semantic")["results"]
    assert syn and syn[0]["document"].lower().startswith("lidar") and syn[0]["matching_words"] == []
    kw = q("sag of an overhead power cable", "keyword")["results"]
    assert all(r["bm25"] > 0 for r in kw)
    assert q("xyzzyplugh", "keyword")["results"] == []
    assert q("xyzzyplugh", "semantic")["notes"]


def test_search_index_management_and_validation(client):
    sess = uuid.uuid4().hex
    assert client.post("/api/search/documents", data={"session": "bad", "text": "hello world again"}).status_code == 400
    assert client.post("/api/search/documents", data={"session": sess}).status_code == 400
    assert client.post("/api/search/documents", data={"session": sess, "text": "ab"}).status_code == 422
    r = client.post("/api/search/documents", data={"session": sess, "text": "Cats purr when they are content. Dogs bark at strangers.", "title": "Pets"}).json()
    assert r["passages"] == 1 and r["source"] == "pasted"
    assert client.post("/api/search/query", data={"session": sess, "query": "the and of", "mode": "hybrid"}).status_code == 422
    assert client.post("/api/search/query", data={"session": sess, "query": "cats", "mode": "magic"}).status_code == 400
    assert client.post("/api/search/query", data={"session": uuid.uuid4().hex, "query": "cats", "mode": "hybrid"}).json()["results"] == []   # another visitor's index is empty
    pdf = (SAMPLES / "invoice-text.pdf").read_bytes()
    assert client.post("/api/search/documents", data={"session": sess}, files=up("i.pdf", pdf)).status_code == 200
    assert client.post("/api/search/documents", data={"session": sess}, files=up("s.pdf", (SAMPLES / "invoice-scanned.pdf").read_bytes())).status_code == 422   # scan: no text layer
    assert client.post("/api/search/documents", data={"session": sess}, files=up("x.png", b"\x89PNG\r\n\x1a\n" + b"0" * 30)).status_code == 415
    docs = client.get("/api/search/documents", params={"session": sess}).json()["documents"]
    assert len(docs) == 2
    assert client.delete(f"/api/search/documents/{docs[0]['id']}", params={"session": sess}).json()["deleted"]
    assert client.delete("/api/search/documents/..%2Fx", params={"session": sess}).status_code == 404
    assert len(client.get("/api/search/documents", params={"session": sess}).json()["documents"]) == 1


def test_product_similarity_is_real_and_explained(client):
    cat = client.get("/api/products").json()
    assert cat["total"] == 140 and "Sneaker" in cat["categories"]
    assert all(i["name"] for i in cat["items"]) and client.get("/api/products", params={"category": "Sneaker"}).json()["items"][0]["category"] == "Sneaker"
    assert len(client.get("/api/products", params={"q": "zzzzzz"}).json()["items"]) == 0
    sneaker = client.get("/api/products", params={"category": "Sneaker"}).json()["items"][0]["id"]
    r = client.get(f"/api/products/{sneaker}/similar", params={"k": 6, "image_weight": 0.5}).json()
    same = sum(x["category"] == "Sneaker" for x in r["results"])
    assert same >= 4, [x["category"] for x in r["results"]]                         # image features and text both cluster by article type
    assert [x["score"] for x in r["results"]] == sorted((x["score"] for x in r["results"]), reverse=True) and sneaker not in [x["id"] for x in r["results"]]
    x = r["results"][0]
    assert abs(x["score"] - (0.5 * x["image_similarity"] + 0.5 * x["text_similarity"])) < 1e-6 and "TF-IDF" in r["method"]
    txt_only = client.get(f"/api/products/{sneaker}/similar", params={"image_weight": 0}).json()["results"][0]
    assert abs(txt_only["score"] - txt_only["text_similarity"]) < 1e-6
    assert client.get("/api/products/pzzz/similar").status_code == 404 and client.get(f"/api/products/{sneaker}/similar", params={"image_weight": 2}).status_code == 422
    img = client.get(f"/api/products/{sneaker}/image")
    assert img.status_code == 200 and img.content[:4] == b"\x89PNG"


def test_health_and_samples(client):
    h = client.get("/api/health").json()
    assert h["ok"] and all(h["available"][k] for k in ("classifier", "detector", "segmenter", "pose", "catalogue")) and h["models"]["detector"]["licence"] == "Apache-2.0"
    s = client.get("/api/samples").json()["samples"]
    assert all(x["provenance"] and x["licence"] for x in s) and {"image", "video", "document", "csv", "text", "catalogue"} <= {x["kind"] for x in s}
    assert client.get("/api/samples/chelsea/file").status_code == 200 and client.get("/api/samples/..%2Fx/file").status_code == 404
