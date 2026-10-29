"""Real models on the bundled real images."""
import io
import time

from PIL import Image

from tests.conftest import SAMPLES, post, up


def test_classification_of_a_cat_and_a_coffee_cup(client):
    r = post(client, "/api/classify", "chelsea").json()
    assert any(w in r["predictions"][0]["label"] for w in ("cat", "tabby")) and r["predictions"][0]["probability"] > 0.3
    assert len(r["predictions"]) == 5 and abs(sum(p["probability"] for p in r["predictions"])) <= 1.0001
    assert [p["probability"] for p in r["predictions"]] == sorted((p["probability"] for p in r["predictions"]), reverse=True)
    r2 = post(client, "/api/classify", "coffee", top_k="3").json()
    assert len(r2["predictions"]) == 3 and "cup" in " ".join(p["label"] for p in r2["predictions"]) or "espresso" in " ".join(p["label"] for p in r2["predictions"])
    r3 = post(client, "/api/classify", "rocket").json()
    assert any(w in " ".join(p["label"] for p in r3["predictions"]) for w in ("projectile", "missile", "space", "rocket", "pole", "lighter"))


def test_classification_input_validation(client):
    assert post(client, "/api/classify").status_code == 400
    assert post(client, "/api/classify", "nope").status_code == 404
    assert post(client, "/api/classify", "chelsea", top_k="99").status_code == 400
    assert client.post("/api/classify", files=up("a.txt", b"hello")).status_code == 415
    assert client.post("/api/classify", files=up("a.jpg", b"")).status_code == 400
    assert client.post("/api/classify", files=up("a.jpg", b"\xff\xd8\xff\xe0" + b"0" * 50)).status_code == 422
    big = io.BytesIO()
    Image.new("L", (6000, 6000)).save(big, "PNG")
    assert client.post("/api/classify", files=up("big.png", big.getvalue())).status_code == 422       # 36 MP > 25 MP
    assert client.post("/api/classify", files=up("a.pdf", b"%PDF-1.4 x")).status_code == 415
    assert client.post("/api/classify", files=up("x.png", b"\x89PNG\r\n\x1a\n" * 800000)).status_code == 413


def test_detection_finds_the_pedestrians_and_draws_them(client):
    r = post(client, "/api/detect/image", "street", threshold="0.4").json()
    assert r["counts"].get("person", 0) >= 3 and r["annotated"].startswith("data:image/jpeg;base64,")
    assert all(0 <= d["score"] <= 1 and d["box"][2] > d["box"][0] for d in r["detections"])
    hi = post(client, "/api/detect/image", "street", threshold="0.9").json()
    assert len(hi["detections"]) <= len(r["detections"])
    assert post(client, "/api/detect/image", "street", threshold="2").status_code == 400
    empty = io.BytesIO()
    Image.new("RGB", (320, 240), (120, 120, 120)).save(empty, "PNG")
    assert client.post("/api/detect/image", files=up("blank.png", empty.getvalue())).json()["detections"] == []      # nothing invented on a blank image


def wait_job(client, jid, timeout=240):
    t = time.time()
    while time.time() - t < timeout:
        j = client.get(f"/api/jobs/{jid}").json()
        if j["status"] in ("completed", "failed", "cancelled"):
            return j
        time.sleep(0.5)
    raise AssertionError("timeout")


def test_video_detection_job_produces_a_real_annotated_mp4(client):
    j = client.post("/api/detect/video", data={"analysed_fps": "2"}, files=up("c.mp4", (SAMPLES / "pedestrians-8s.mp4").read_bytes())).json()
    r = wait_job(client, j["job_id"])
    assert r["status"] == "completed", r["error"]
    res = r["result"]
    assert res["frames_analysed"] >= 14 and res["detection_instances_by_class"].get("person", 0) > 20 and "no tracking" in res["note"]
    mp4 = client.get(r["output_url"])
    assert mp4.status_code == 200 and mp4.content[4:8] == b"ftyp" and len(mp4.content) > 5000
    assert client.get("/api/jobs/" + "0" * 32).status_code == 404 and client.get("/api/jobs/zzz").status_code == 404
    assert client.post("/api/detect/video", files=up("x.png", b"\x89PNG\r\n\x1a\n" + b"0" * 30)).status_code == 415


def test_broken_video_fails_cleanly(client):
    j = client.post("/api/detect/video", files=up("x.mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 400)).json()
    r = wait_job(client, j["job_id"])
    assert r["status"] == "failed" and "could not be opened" in r["error"] or "No frame" in r["error"]


def test_segmentation_masks(client):
    r = post(client, "/api/segment", "astronaut", opacity="0.6").json()
    labels = [c["label"] for c in r["classes"]]
    assert "person" in labels and r["classes"][0]["label"] in ("background", "person") and abs(sum(c["share"] for c in r["classes"]) - 1) < 1e-6
    assert next(c for c in r["classes"] if c["label"] == "person")["share"] > 0.15
    assert r["mask_png"].startswith("data:image/png") and len(r["known_classes"]) == 21
    cat = post(client, "/api/segment", "chelsea").json()
    assert "cat" in [c["label"] for c in cat["classes"]]
    assert post(client, "/api/segment", "chelsea", opacity="3").status_code == 400


def test_pose_on_people_and_on_nobody(client):
    r = post(client, "/api/pose/image", "street").json()
    ok = [p for p in r["persons"] if p.get("keypoints")]
    assert len(ok) >= 3 and all(len(p["keypoints"]) == 33 for p in ok) and r["annotated"].startswith("data:image/jpeg")
    p = ok[0]
    nose, ankle = p["keypoints"][0], p["keypoints"][27]
    assert nose["y"] < ankle["y"] and p["box"][1] - 20 < nose["y"] < p["box"][3] and "activity" in r["note"]      # head above feet, inside the box
    none = post(client, "/api/pose/image", "rocket").json()
    assert none["persons"] == [] and "No person" in none["message"]
    a = post(client, "/api/pose/image", "astronaut").json()["persons"]
    assert a and a[0]["keypoints"] and a[0]["joint_angles_degrees"] is not None
