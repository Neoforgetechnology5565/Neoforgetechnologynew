"""Convert Intel's `worker_safety_mobilenet` (MobileNet-SSD, Caffe) to ONNX so it can run in a browser with ONNX Runtime Web, and export the SSD prior boxes.

Needs OpenCV 4.x (it still has the Caffe importer; used only to read the weights), onnx and onnxruntime:
    python scripts/convert_safety_to_onnx.py [out_dir]
Writes worker_safety_mobilenet.onnx (inputs: data [1,3,224,224] raw BGR 0-255; outputs: loc [1,4056], conf [1,5070]) and priors.json (1014 priors x [xmin,ymin,xmax,ymax] plus the four variances).

The graph reproduces what OpenCV runs, including one quirk of the original deploy file: its Reshape layer is [0,-1,6] although the network has 5 classes (6 priors x 5 classes = 30 channels on the last head), so the soft-max is applied over groups of 6 values of the flattened confidences, not 5. OpenCV (which the server uses) does exactly that, and so does this graph; see MODEL_AND_LICENSES.md. The detection decoder (decode.py / the TypeScript port) then reads conf[prior * 5 + class] like Caffe's DetectionOutput.
The conversion is checked numerically against OpenCV by scripts/check_safety_onnx.py.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HERE = Path(__file__).resolve().parent.parent / "models" / "worker-safety-mobilenet"


def parse_prototxt(text: str) -> tuple[list[dict], list[int]]:
    tokens = re.findall(r'"[^"]*"|[{}:]|[^\s{}:]+', text)
    pos = 0

    def val(tok: str):
        if tok.startswith('"'):
            return tok[1:-1]
        if tok in ("true", "false"):
            return tok == "true"
        try:
            return int(tok)
        except ValueError:
            try:
                return float(tok)
            except ValueError:
                return tok

    def block() -> dict:
        nonlocal pos
        d: dict = {}
        while pos < len(tokens) and tokens[pos] != "}":
            key = tokens[pos]
            pos += 1
            if tokens[pos] == ":":
                pos += 1
                d.setdefault(key, []).append(val(tokens[pos]))
                pos += 1
            elif tokens[pos] == "{":
                pos += 1
                d.setdefault(key, []).append(block())
                pos += 1  # closing brace
        return d
    top = block()
    shape = [x["dim"] for x in top["input_shape"]][0]
    return top["layer"], shape


def one(d: dict, k: str, default=None):
    return d[k][0] if k in d else default


def main(out: Path) -> None:
    layers, in_shape = parse_prototxt((HERE / "worker_safety_mobilenet.prototxt").read_text())
    net = cv2.dnn.readNetFromCaffe(str(HERE / "worker_safety_mobilenet.prototxt"), str(HERE / "worker_safety_mobilenet.caffemodel"))
    nodes, inits = [], []
    cur: dict[str, str] = {"data": "data"}  # caffe blob -> onnx tensor
    counter = [0]

    def fresh(base: str) -> str:
        counter[0] += 1
        return f"{base}_{counter[0]}"

    def blobs(name: str) -> list[np.ndarray]:
        return [np.array(b) for b in net.getLayer(net.getLayerId(name)).blobs]

    pending_bn: dict[str, tuple] = {}
    priors, variances = [], None
    fmap_hw: dict[str, tuple[int, int]] = {}

    def shape_after_conv(src: str, k: int, s: int, p: int) -> tuple[int, int]:
        h, w = fmap_hw[src]
        return ((h + 2 * p - k) // s + 1, (w + 2 * p - k) // s + 1)
    fmap_hw["data"] = (in_shape[2], in_shape[3])

    for L in layers:
        t, name = one(L, "type"), one(L, "name")
        bottoms, tops = L.get("bottom", []), L.get("top", [])
        if t == "Convolution":
            cp = one(L, "convolution_param")
            W = blobs(name)[0].astype(np.float32)
            bias = one(cp, "bias_term", True)
            B = blobs(name)[1].reshape(-1).astype(np.float32) if bias else None
            k, s, p, g = one(cp, "kernel_size", 1), one(cp, "stride", 1), one(cp, "pad", 0), one(cp, "group", 1)
            wn, out_name = fresh(name + "_w"), fresh(name)
            inits.append(numpy_helper.from_array(W, wn))
            ins = [cur[bottoms[0]], wn]
            if B is not None:
                bn_ = fresh(name + "_b")
                inits.append(numpy_helper.from_array(B, bn_))
                ins.append(bn_)
            nodes.append(helper.make_node("Conv", ins, [out_name], kernel_shape=[k, k], strides=[s, s], pads=[p, p, p, p], group=g, name=name))
            cur[tops[0]] = out_name
            fmap_hw[tops[0]] = shape_after_conv(bottoms[0], k, s, p)
        elif t == "BatchNorm":
            mean, var, sf = blobs(name)
            f = 0.0 if sf.reshape(-1)[0] == 0 else 1.0 / sf.reshape(-1)[0]
            pending_bn[tops[0]] = (mean.reshape(-1) * f, var.reshape(-1) * f, 1e-5)
            fmap_hw[tops[0]] = fmap_hw[bottoms[0]]
        elif t == "Scale":
            gamma, beta = (b.reshape(-1).astype(np.float32) for b in blobs(name))
            mean, var, eps = pending_bn.pop(bottoms[0])
            names = [fresh(name + s_) for s_ in ("_g", "_b", "_m", "_v")]
            for n_, arr in zip(names, (gamma, beta, mean.astype(np.float32), var.astype(np.float32))):
                inits.append(numpy_helper.from_array(arr, n_))
            out_name = fresh(name)
            nodes.append(helper.make_node("BatchNormalization", [cur[bottoms[0]], *names], [out_name], epsilon=eps, name=name))
            cur[tops[0]] = out_name
        elif t == "ReLU":
            out_name = fresh(name)
            nodes.append(helper.make_node("Relu", [cur[bottoms[0]]], [out_name], name=name))
            cur[tops[0]] = out_name
            fmap_hw[tops[0]] = fmap_hw[bottoms[0]]
        elif t == "Permute":
            order = one(L, "permute_param")["order"]
            out_name = fresh(name)
            nodes.append(helper.make_node("Transpose", [cur[bottoms[0]]], [out_name], perm=order, name=name))
            cur[tops[0]] = out_name
        elif t == "Flatten":
            out_name = fresh(name)
            nodes.append(helper.make_node("Flatten", [cur[bottoms[0]]], [out_name], axis=one(one(L, "flatten_param", {}), "axis", 1), name=name))
            cur[tops[0]] = out_name
        elif t == "Concat":
            out_name = fresh(name)
            if tops[0] == "mbox_priorbox":
                cur[tops[0]] = "PRIORS"
                continue
            nodes.append(helper.make_node("Concat", [cur[b] for b in bottoms], [out_name], axis=one(one(L, "concat_param", {}), "axis", 1), name=name))
            cur[tops[0]] = out_name
        elif t == "Reshape":
            dims = [x for x in one(L, "reshape_param")["shape"][0]["dim"]]
            sn, out_name = fresh(name + "_shape"), fresh(name)
            inits.append(numpy_helper.from_array(np.array([1 if d == 0 else d for d in dims], np.int64), sn))
            nodes.append(helper.make_node("Reshape", [cur[bottoms[0]], sn], [out_name], name=name))
            cur[tops[0]] = out_name
        elif t == "Softmax":
            out_name = fresh(name)
            nodes.append(helper.make_node("Softmax", [cur[bottoms[0]]], [out_name], axis=one(one(L, "softmax_param", {}), "axis", 1), name=name))
            cur[tops[0]] = out_name
        elif t == "PriorBox":
            pp = one(L, "prior_box_param")
            fh, fw = fmap_hw[bottoms[0]]
            img = in_shape[2]
            mins, maxs = pp.get("min_size", []), pp.get("max_size", [])
            ars = [1.0]
            for ar in pp.get("aspect_ratio", []):
                if all(abs(ar - a) > 1e-6 for a in ars):
                    ars.append(ar)
                    if one(pp, "flip", False):
                        ars.append(1.0 / ar)
            off = one(pp, "offset", 0.5)
            step_w = step_h = img / fw if one(pp, "step") is None else one(pp, "step")
            step_h = img / fh if one(pp, "step") is None else one(pp, "step")
            step_w = img / fw if one(pp, "step") is None else one(pp, "step")
            for y in range(fh):
                for x in range(fw):
                    cx, cy = (x + off) * step_w, (y + off) * step_h
                    for si, ms in enumerate(mins):
                        bw = bh = ms
                        priors.append([(cx - bw / 2) / img, (cy - bh / 2) / img, (cx + bw / 2) / img, (cy + bh / 2) / img])
                        if maxs:
                            sz = float(np.sqrt(ms * maxs[si]))
                            priors.append([(cx - sz / 2) / img, (cy - sz / 2) / img, (cx + sz / 2) / img, (cy + sz / 2) / img])
                        for ar in ars:
                            if abs(ar - 1) < 1e-6:
                                continue
                            bw, bh = ms * float(np.sqrt(ar)), ms / float(np.sqrt(ar))
                            priors.append([(cx - bw / 2) / img, (cy - bh / 2) / img, (cx + bw / 2) / img, (cy + bh / 2) / img])
            if one(pp, "clip", False):
                priors[:] = [[min(1.0, max(0.0, v)) for v in p] for p in priors]
            variances = [float(v) for v in pp["variance"]]
        elif t == "DetectionOutput":
            cur["_detection_params"] = one(L, "detection_output_param")
        else:
            raise SystemExit(f"unsupported layer type {t} ({name})")
    loc, conf = cur["mbox_loc"], cur["mbox_conf_flatten"]
    nodes.append(helper.make_node("Identity", [loc], ["loc"]))
    nodes.append(helper.make_node("Identity", [conf], ["conf"]))
    # the raw 5-class confidences (before the 6-group soft-max) are not needed: OpenCV's detection reads the soft-maxed ones
    graph = helper.make_graph(nodes, "worker_safety_mobilenet", [helper.make_tensor_value_info("data", TensorProto.FLOAT, in_shape)],
                              [helper.make_tensor_value_info("loc", TensorProto.FLOAT, [1, len(priors) * 4]), helper.make_tensor_value_info("conf", TensorProto.FLOAT, [1, len(priors) * 5])], inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    out.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(out / "worker_safety_mobilenet.onnx"))
    dp = cur["_detection_params"]
    (out / "priors.json").write_text(json.dumps({"priors": [[round(v, 7) for v in p] for p in priors], "variances": variances, "num_classes": dp["num_classes"][0], "confidence_threshold": dp["confidence_threshold"][0], "nms_threshold": dp["nms_param"][0]["nms_threshold"][0], "top_k": dp["nms_param"][0]["top_k"][0], "keep_top_k": dp["keep_top_k"][0], "input": in_shape}))
    print(f"wrote {out}/worker_safety_mobilenet.onnx ({(out / 'worker_safety_mobilenet.onnx').stat().st_size / 1e6:.1f} MB) and priors.json with {len(priors)} priors")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent)
