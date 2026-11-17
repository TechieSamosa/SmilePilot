"""
Tooth-level external check on DENTEX test films. DENTEX boxes whole diseased teeth, while DentalOS
detects the lesion itself, so we score what the app reports: a diseased tooth counts as found when a
predicted lesion box of the same kind lies mostly (>=50%) inside that tooth's box.

    python training/eval_tooth_level.py --weights .../best.pt --meta app/public/models/pathology.json
"""
import argparse
import glob
import json
import os


def ioa(p, t):  # intersection over area of the predicted (small) box
    x1, y1 = max(p[0], t[0]), max(p[1], t[1])
    x2, y2 = min(p[2], t[2]), min(p[3], t[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    return inter / max(1e-9, (p[2] - p[0]) * (p[3] - p[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--data", default="D:/DentalOS-train/data/dentex_dx_test")
    a = ap.parse_args()
    from ultralytics import YOLO

    th = json.load(open(a.meta)).get("thresholds", {})
    m = YOLO(a.weights)
    names = m.names
    res = {}
    for cls in (4, 7, 6):
        res[names[cls]] = {"teeth": 0, "found": 0, "pred": 0, "pred_on_labelled_tooth": 0}
    imgs = sorted(glob.glob(os.path.join(a.data, "images", "*.jpg")))
    for img in imgs:
        r = m.predict(img, imgsz=960, conf=0.1, verbose=False)[0]
        W, H = r.orig_shape[1], r.orig_shape[0]
        gts = []
        for l in open(os.path.join(a.data, "labels", os.path.basename(img)[:-4] + ".txt")):
            if not l.strip():
                continue
            c, cx, cy, w, h = l.split()
            c = int(c)
            gts.append((c, ((float(cx) - float(w) / 2) * W, (float(cy) - float(h) / 2) * H, (float(cx) + float(w) / 2) * W, (float(cy) + float(h) / 2) * H)))
        preds = [(int(c), b.tolist()) for c, b, s in zip(r.boxes.cls, r.boxes.xyxy, r.boxes.conf) if float(s) >= th.get(names[int(c)], 0.3)]
        for cls in (4, 7, 6):
            k = names[cls]
            g = [b for c, b in gts if c == cls]
            p = [b for c, b in preds if c == cls]
            res[k]["teeth"] += len(g)
            res[k]["found"] += sum(any(ioa(pb, gb) >= 0.5 for pb in p) for gb in g)
            res[k]["pred"] += len(p)
            res[k]["pred_on_labelled_tooth"] += sum(any(ioa(pb, gb) >= 0.5 for gb in g) for pb in p)
    out = {}
    for k, v in res.items():
        out[k] = {
            "diseased_teeth": v["teeth"],
            "tooth_level_recall": round(v["found"] / max(1, v["teeth"]), 3),
            "share_of_AI_boxes_on_a_labelled_tooth": round(v["pred_on_labelled_tooth"] / max(1, v["pred"]), 3),
        }
    print(json.dumps({"films": len(imgs), **out}, indent=2))


if __name__ == "__main__":
    main()
