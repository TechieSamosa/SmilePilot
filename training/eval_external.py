"""
External check of the pathology model on DENTEX diagnosis test films (a different dataset/source,
never used in training). Only caries, periapical lesion and impacted tooth are labelled there.

    python training/eval_external.py --weights D:/DentalOS-train/runs/pathology/weights/best.pt
"""
import argparse
import json
from pathlib import Path


def main():

    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True)
    ap.add_argument("--data", default="D:/DentalOS-train/data/dentex_dx_test")
    ap.add_argument("--imgsz", type=int, default=960)
    a = ap.parse_args()

    from ultralytics import YOLO

    m = YOLO(a.weights)
    names = m.names
    yaml_path = Path(a.data) / "dentex.yaml"
    yaml_path.write_text(
        f"path: {Path(a.data).as_posix()}\ntrain: images\nval: images\nnames:\n" + "".join(f"  {i}: {n}\n" for i, n in names.items())
    )
    # DentalOS ids: 4 caries, 6 impacted_tooth, 7 periapical_lesion
    r = m.val(data=str(yaml_path), imgsz=a.imgsz, batch=4, classes=[4, 6, 7], plots=False, verbose=False)
    out = {names[int(i)]: {"mAP50": round(float(ap50), 3), "precision": round(float(p), 3), "recall": round(float(rc), 3)}
           for i, ap50, p, rc in zip(r.box.ap_class_index, r.box.ap50, r.box.p, r.box.r)}
    print(json.dumps(out, indent=2))



if __name__ == "__main__":
    main()
