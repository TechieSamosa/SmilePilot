"""Write per-class default display thresholds (best-F1 confidence on the validation split) into <task>.json."""
import argparse
import json
from pathlib import Path
import numpy as np


def main():


    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--meta", required=True, help="app/public/models/<task>.json to update")
    ap.add_argument("--imgsz", type=int, default=960)
    a = ap.parse_args()

    from ultralytics import YOLO

    m = YOLO(a.weights)
    r = m.val(data=a.data, imgsz=a.imgsz, split="val", batch=4, plots=False, verbose=False)
    px = np.linspace(0, 1, r.box.f1_curve.shape[1])
    th = {}
    for row, ci in zip(r.box.f1_curve, r.box.ap_class_index):
        best = float(px[int(row.argmax())]) if row.max() > 0.05 else 0.95  # unreliable class -> effectively hidden
        th[m.names[int(ci)]] = round(min(0.95, max(0.2, best)), 3)
    for i, n in m.names.items():
        th.setdefault(n, 0.95)  # never seen in validation
    meta = json.loads(Path(a.meta).read_text())
    meta["thresholds"] = th
    Path(a.meta).write_text(json.dumps(meta, indent=2))
    print(json.dumps(th, indent=2))



if __name__ == "__main__":
    main()
