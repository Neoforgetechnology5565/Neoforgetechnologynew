#!/usr/bin/env python3
"""Build models/footandball.onnx from the published FootAndBall weights without PyTorch.

Source: https://github.com/jac99/FootAndBall (MIT, Copyright (c) 2020 Sport Algorithmics and Gaming),
weights file models/model_20201019_1416_final.pth in that repository (see docs/sports/MODEL_AND_LICENSES.md for the licence caveat).
The network (Table 1 of the paper: a small VGG-like backbone with a two-level feature pyramid) is re-expressed as an ONNX graph with
BatchNorm folded into the convolutions. Outputs are the softmax ball map (stride 4), the softmax player map (stride 16) and the
player box regression map (stride 16), exactly what the authors' `FootAndBall.forward` computes in 'detect' mode before peak picking.
Input: float32 NCHW RGB, ImageNet mean/std normalised, H and W multiples of 32.

    python scripts/convert_footandball.py [weights.pth]   # downloads the weights from GitHub if no path is given
"""
from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

sys.path.insert(0, str(Path(__file__).parent))
from torch_zip import load_state_dict  # noqa: E402

URL = "https://raw.githubusercontent.com/jac99/FootAndBall/master/models/model_20201019_1416_final.pth"
SHA256 = None  # printed on conversion and recorded in docs
ROOT = Path(__file__).resolve().parent.parent


def build(sd: dict[str, np.ndarray]) -> onnx.ModelProto:
    nodes, inits = [], []

    def init(name, arr):
        inits.append(numpy_helper.from_array(np.asarray(arr, dtype=np.float32), name))
        return name

    def conv(x, w, b, out, pad):
        nodes.append(helper.make_node("Conv", [x, init(out + "_w", w), init(out + "_b", b)], [out], kernel_shape=list(w.shape[2:]), pads=[pad] * 4))
        return out

    def relu(x, out):
        nodes.append(helper.make_node("Relu", [x], [out]))
        return out

    def conv_bn(x, prefix, out):
        w = sd[prefix + ".0.weight"]; g, be = sd[prefix + ".1.weight"], sd[prefix + ".1.bias"]; m, v = sd[prefix + ".1.running_mean"], sd[prefix + ".1.running_var"]
        s = g / np.sqrt(v + 1e-5)  # PyTorch BatchNorm2d eps
        return relu(conv(x, w * s[:, None, None, None], be - m * s, out, 1), out + "_r")

    x = "input"
    feats = []
    # module layout from the reference code: [conv-bn-relu]{1,2} + MaxPool2d(2), five modules
    spec = [(0, [0]), (1, [0, 3]), (2, [0, 3]), (3, [0, 3]), (4, [0, 3])]
    for mi, idxs in spec:
        for j, ci in enumerate(idxs):
            # conv index ci, BN ci+1, relu ci+2
            sub = {f"base_network.layers.{mi}.{ci}.weight": 0}
            pref = f"base_network.layers.{mi}.{ci}"
            w = sd[pref + ".weight"]; g, be = sd[f"base_network.layers.{mi}.{ci + 1}.weight"], sd[f"base_network.layers.{mi}.{ci + 1}.bias"]
            m, v = sd[f"base_network.layers.{mi}.{ci + 1}.running_mean"], sd[f"base_network.layers.{mi}.{ci + 1}.running_var"]
            s = g / np.sqrt(v + 1e-5)
            x = relu(conv(x, w * s[:, None, None, None], be - m * s, f"m{mi}c{j}", 1), f"m{mi}c{j}_r")
        nodes.append(helper.make_node("MaxPool", [x], [f"m{mi}_pool"], kernel_shape=[2, 2], strides=[2, 2]))
        x = f"m{mi}_pool"
        feats.append(x)

    def lat(i, name):  # lateral_layers[i-1] is applied to c[i]
        return conv(feats[i], sd[f"base_network.lateral_layers.{i - 1}.weight"], sd[f"base_network.lateral_layers.{i - 1}.bias"], name, 0)

    def up_add(top, side, name):
        nodes.append(helper.make_node("Resize", [top, "", init(name + "_scales", np.array([1, 1, 2, 2], np.float32))], [name + "_up"], mode="linear", coordinate_transformation_mode="half_pixel"))
        nodes.append(helper.make_node("Add", [name + "_up", side], [name]))
        return name

    p3 = lat(4, "p_ds32")
    p2 = up_add(p3, lat(3, "lat_ds16"), "p_ds16")
    p1 = up_add(p2, lat(2, "lat_ds8"), "p_ds8")
    p0 = up_add(p1, lat(1, "lat_ds4"), "p_ds4")

    def head(x, prefix, out):
        h = relu(conv(x, sd[prefix + ".0.weight"], sd[prefix + ".0.bias"], out + "_h", 1), out + "_hr")
        return conv(h, sd[prefix + ".2.weight"], sd[prefix + ".2.bias"], out, 1)

    ball = head(p0, "ball_classifier", "ball_logits")
    player = head(p2, "player_classifier", "player_logits")
    bbox = head(p2, "player_regressor", "player_bbox")
    nodes.append(helper.make_node("Softmax", [ball], ["ball_prob"], axis=1))
    nodes.append(helper.make_node("Softmax", [player], ["player_prob"], axis=1))
    nodes.append(helper.make_node("Identity", [bbox], ["player_box"]))
    f = TensorProto.FLOAT
    g = helper.make_graph(nodes, "footandball", [helper.make_tensor_value_info("input", f, [1, 3, "H", "W"])],
                          [helper.make_tensor_value_info("ball_prob", f, [1, 2, "h4", "w4"]), helper.make_tensor_value_info("player_prob", f, [1, 2, "h16", "w16"]), helper.make_tensor_value_info("player_box", f, [1, 4, "h16", "w16"])], inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)])
    m.ir_version = 8
    onnx.checker.check_model(m)
    return m


if __name__ == "__main__":
    pth = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "models" / "model_20201019_1416_final.pth"
    if not pth.is_file():
        pth.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(URL, pth)
    print("weights sha256", hashlib.sha256(pth.read_bytes()).hexdigest())
    out = ROOT / "models" / "footandball.onnx"
    onnx.save(build(load_state_dict(str(pth))), out)
    print("wrote", out, out.stat().st_size, "bytes")
