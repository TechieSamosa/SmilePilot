"""
Train the two DentalOS on-device models and export them for the phone app.

    python training/train.py pathology --data D:/DentalOS-train/data/pathology/data.yaml
    python training/train.py teeth     --data D:/DentalOS-train/data/teeth/data.yaml

Defaults are sized for a 4 GB laptop GPU (RTX 3050). On Kaggle/Colab (T4/P100) raise
--batch to 16 and keep everything else. Fine-tuning from dentist feedback: pass the
dataset exported from the app (Settings -> AI learning -> Export training data) as
--data and --weights pointing at the previous best.pt (see training/README.md).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

PRESETS = {
    # Pathology: small lesions on large panoramic films -> 960 px, YOLOv8s (good accuracy/speed on phones).
    "pathology": dict(model="yolov8s.pt", imgsz=960, epochs=50, batch=6, fliplr=0.5),
    # Teeth numbering: left/right matters for FDI numbers -> NO horizontal flip. Teeth are large -> 640 + nano.
    "teeth": dict(model="yolov8n.pt", imgsz=640, epochs=60, batch=16, fliplr=0.0),
}


def keep_awake() -> None:
    """Stop Windows from sleeping while training runs (released automatically when the process exits)."""
    if sys.platform == "win32":
        import ctypes

        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)


def main() -> None:
    keep_awake()
    ap = argparse.ArgumentParser()
    ap.add_argument("task", choices=PRESETS)
    ap.add_argument("--data", required=True)
    ap.add_argument("--weights", help="start from these weights (fine-tuning)")
    ap.add_argument("--epochs", type=int)
    ap.add_argument("--batch", type=int)
    ap.add_argument("--imgsz", type=int)
    ap.add_argument("--project", default="D:/DentalOS-train/runs")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "app" / "public" / "models"))
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--cache", default="disk", help="disk | ram | none (disk caches resized images; much faster)")
    ap.add_argument("--resume", action="store_true", help="continue an interrupted run from its last.pt")
    a = ap.parse_args()

    from ultralytics import YOLO

    p = dict(PRESETS[a.task])
    for k in ("epochs", "batch", "imgsz"):
        if getattr(a, k):
            p[k] = getattr(a, k)
    last = Path(a.project) / a.task / "weights" / "last.pt"
    if a.resume and last.exists():
        print(f"Resuming from {last}")
        YOLO(str(last)).train(resume=True)
    else:
        _train(YOLO(a.weights or p["model"]), a, p)
    _export(a, p)


def _train(model, a, p) -> None:
    model.train(
        data=a.data,
        epochs=p["epochs"],
        imgsz=p["imgsz"],
        batch=p["batch"],
        fliplr=p["fliplr"],
        workers=a.workers,
        cache=False if a.cache == "none" else a.cache,
        project=a.project,
        name=a.task,
        exist_ok=True,
        patience=25,
        cos_lr=True,
        close_mosaic=10,
        amp=True,
        plots=True,
        seed=0,
    )


def _export(a, p) -> None:
    from ultralytics import YOLO

    best = Path(a.project) / a.task / "weights" / "best.pt"
    trained = YOLO(str(best))
    metrics = trained.val(data=a.data, imgsz=p["imgsz"], split="test", batch=p["batch"], plots=False)
    onnx_path = Path(trained.export(format="onnx", imgsz=p["imgsz"], dynamic=True, simplify=True, opset=17))

    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    # store weights as fp16 (half the download, identical fp32 maths at runtime)
    from compress_onnx import compress

    compress(str(onnx_path), str(out_dir / f"{a.task}.onnx"))
    names = trained.names
    meta = {
        "task": a.task,
        "version": f"{a.task}-{__import__('datetime').date.today().isoformat()}",
        "imgsz": p["imgsz"],
        "classes": [names[i] for i in sorted(names)],
        "test_map50": round(float(metrics.box.map50), 4),
        "test_map50_95": round(float(metrics.box.map), 4),
        "per_class_map50": {names[i]: round(float(v), 4) for i, v in zip(metrics.box.ap_class_index, metrics.box.ap50)},
    }
    (out_dir / f"{a.task}.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
