"""
Halve an ONNX model's download size without changing its maths at runtime:
float32 weights are stored as float16 and cast back to float32 when the session loads
(compute stays fp32, so it runs on every phone's WASM backend). Verifies the
compressed model against the original on random input and sample images.

    python training/compress_onnx.py in.onnx out.onnx [--check-images DIR]
"""
from __future__ import annotations

import argparse
import glob
import os

import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto


def compress(src: str, dst: str, min_elems: int = 1024) -> None:
    m = onnx.load(src)
    g = m.graph
    new_inits, casts = [], []
    for init in g.initializer:
        if init.data_type == TensorProto.FLOAT and np.prod(init.dims) >= min_elems:
            arr = numpy_helper.to_array(init).astype(np.float16)
            h = numpy_helper.from_array(arr, init.name + "__fp16")
            new_inits.append(h)
            casts.append(helper.make_node("Cast", [h.name], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
        else:
            new_inits.append(init)
    del g.initializer[:]
    g.initializer.extend(new_inits)
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(casts + nodes)
    onnx.checker.check_model(m)
    onnx.save(m, dst)
    print(f"{src}: {os.path.getsize(src)/1e6:.1f} MB -> {dst}: {os.path.getsize(dst)/1e6:.1f} MB")


def letterbox(img: np.ndarray, size: int) -> np.ndarray:
    import cv2

    h, w = img.shape[:2]
    r = min(size / h, size / w)
    nh, nw = round(h * r), round(w * r)
    H, W = -(-nh // 32) * 32, -(-nw // 32) * 32
    out = np.full((H, W, 3), 114, np.uint8)
    t, l = (H - nh) // 2, (W - nw) // 2
    out[t : t + nh, l : l + nw] = cv2.resize(img, (nw, nh))
    return out.transpose(2, 0, 1)[None].astype(np.float32) / 255.0


def verify(a: str, b: str, images: str | None, imgsz: int) -> None:
    import onnxruntime as ort

    sa, sb = ort.InferenceSession(a), ort.InferenceSession(b)
    name = sa.get_inputs()[0].name
    inputs = [np.random.rand(1, 3, imgsz, imgsz).astype(np.float32)]
    if images:
        import cv2

        for f in sorted(glob.glob(os.path.join(images, "*.jpg")))[:4]:
            inputs.append(letterbox(cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB), imgsz))
    for x in inputs:
        oa = sa.run(None, {name: x})[0]
        ob = sb.run(None, {name: x})[0]
        sc_a, sc_b = oa[0, 4:], ob[0, 4:]
        print(f"shape {x.shape}: max_dbox={np.abs(oa[0,:4]-ob[0,:4]).max():.3f}px  max_dscore={np.abs(sc_a-sc_b).max():.4f}  top score {sc_a.max():.3f} vs {sc_b.max():.3f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--check-images")
    ap.add_argument("--imgsz", type=int, default=960)
    a = ap.parse_args()
    compress(a.src, a.dst)
    verify(a.src, a.dst, a.check_images, a.imgsz)
