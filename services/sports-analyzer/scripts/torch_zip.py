"""Read a PyTorch .pth state_dict (zip + pickle) WITHOUT importing torch. Only tensors are reconstructed; no other object type is allowed."""
from __future__ import annotations

import pickle
import zipfile
from collections import OrderedDict

import numpy as np

_DT = {"FloatStorage": np.float32, "LongStorage": np.int64, "DoubleStorage": np.float64, "HalfStorage": np.float16}


class _Storage:
    def __init__(self, dtype, key):
        self.dtype, self.key = dtype, key


def _rebuild(storage, offset, size, stride, *_):
    return ("tensor", storage, offset, tuple(size), tuple(stride))


class _U(pickle.Unpickler):
    def find_class(self, module, name):
        if module == "collections" and name == "OrderedDict":
            return OrderedDict
        if module == "torch._utils" and name == "_rebuild_tensor_v2":
            return _rebuild
        if module == "torch" and name.endswith("Storage"):
            return name
        raise pickle.UnpicklingError(f"blocked global {module}.{name}")

    def persistent_load(self, pid):
        # ('storage', storage_type, key, location, numel)
        return _Storage(_DT[pid[1]], pid[2])


def load_state_dict(path: str) -> dict[str, np.ndarray]:
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        pkl = next(n for n in names if n.endswith("data.pkl"))
        prefix = pkl[: -len("data.pkl")]
        obj = _U(z.open(pkl)).load()
        out = {}
        for k, v in obj.items():
            _, st, off, size, stride = v
            raw = np.frombuffer(z.read(f"{prefix}data/{st.key}"), dtype=st.dtype)
            n = int(np.prod(size)) if size else 1
            out[k] = raw[off:off + n].reshape(size).copy()
        return out
