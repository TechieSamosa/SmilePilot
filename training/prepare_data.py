"""
Prepare clean, correctly-labelled YOLO datasets for DentalOS.

Why this exists: the original Kaggle notebook merged four datasets without remapping
their class IDs and looked for label files next to the images (YOLO keeps them in a
parallel labels/ folder), so the shipped model learned almost nothing (max confidence
~0.01 on real panoramic films). This script builds two datasets with verified labels:

1. pathology/  - 14-class panoramic pathology + restoration dataset (YOLO format,
                 fully annotated). Source: HF `mostafabehroozi/panoramic_radiography_yolo_dataset_14_classes`.
2. teeth/      - 32-class FDI tooth-numbering dataset built from DENTEX enumeration
                 (CC BY 4.0). Source: HF `tirandazdylan/dentex-panoramic`.
   Plus dentex_dx_test/ - DENTEX diagnosis test split, used as an *external* check
                 for caries / periapical lesion / impacted tooth.

Usage:
    python training/prepare_data.py --raw D:/DentalOS-train/raw --out D:/DentalOS-train/data
"""
from __future__ import annotations

import argparse
import io
import shutil
from pathlib import Path

# Final DentalOS pathology taxonomy (index == class id in the 14-class source dataset).
PATHOLOGY_CLASSES = [
    "implant",               # 0 Implant
    "crown_bridge",          # 1 Prosthetic restoration
    "filling",               # 2 Obturation
    "root_canal_treatment",  # 3 Endodontic treatment
    "caries",                # 4 Carious lesion
    "bone_loss",             # 5 Bone resorption
    "impacted_tooth",        # 6 Impacted tooth
    "periapical_lesion",     # 7 Apical periodontitis
    "root_fragment",         # 8 Root fragment
    "furcation_lesion",      # 9 Furcation lesion
    "apical_surgery",        # 10 Apical surgery
    "root_resorption",       # 11 Root resorption
    "orthodontic_device",    # 12 Orthodontic device
    "surgical_device",       # 13 Surgical device
]

# FDI numbering: class id i -> tooth number
FDI_TEETH = [q * 10 + t for q in (1, 2, 3, 4) for t in range(1, 9)]

# DENTEX diagnosis ids -> DentalOS pathology ids
DENTEX_DX_TO_PATHOLOGY = {0: 6, 1: 4, 2: 7, 3: 4}  # Impacted, Caries, Periapical, Deep caries


def write_yaml(path: Path, names: list[str], train: str, val: str, test: str | None = None) -> None:
    lines = [f"path: {path.parent.as_posix()}", f"train: {train}", f"val: {val}"]
    if test:
        lines.append(f"test: {test}")
    lines.append("names:")
    lines += [f"  {i}: {n}" for i, n in enumerate(names)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def prepare_pathology(raw: Path, out: Path) -> None:
    src = raw / "pano14"
    dst = out / "pathology"
    splits = {
        "train": src / "train",
        "val": src / "valid",
        "test": src / "test",
        "ext": src / "test_alte_cabinete" / "Ext-validation",
    }
    for name, s in splits.items():
        for kind in ("images", "labels"):
            (dst / kind / name).mkdir(parents=True, exist_ok=True)
        n = 0
        for img in sorted((s / "images").iterdir()):
            lbl = s / "labels" / (img.stem + ".txt")
            if not lbl.exists():
                continue
            rows = []
            for line in lbl.read_text().splitlines():
                parts = line.split()
                if len(parts) != 5:
                    continue
                cls = int(parts[0])
                if not 0 <= cls < len(PATHOLOGY_CLASSES):
                    raise ValueError(f"Unexpected class {cls} in {lbl}")
                rows.append(line.strip())
            shutil.copy2(img, dst / "images" / name / img.name)
            (dst / "labels" / name / (img.stem + ".txt")).write_text("\n".join(rows) + "\n")
            n += 1
        print(f"pathology/{name}: {n} images")
    write_yaml(dst / "data.yaml", PATHOLOGY_CLASSES, "images/train", "images/val", "images/test")
    write_yaml(dst / "data_ext.yaml", PATHOLOGY_CLASSES, "images/train", "images/ext")


def _parquet_rows(path: Path):
    import pyarrow.parquet as pq

    table = pq.read_table(path)
    return table.to_pylist()


def prepare_teeth(raw: Path, out: Path) -> None:
    from PIL import Image

    dst = out / "teeth"
    for split, fname in (("train", "train"), ("val", "validation"), ("test", "test")):
        (dst / "images" / split).mkdir(parents=True, exist_ok=True)
        (dst / "labels" / split).mkdir(parents=True, exist_ok=True)
        rows = _parquet_rows(raw / "dentex" / "enumeration" / f"{fname}.parquet")
        for r in rows:
            img_bytes = r["image"]["bytes"]
            im = Image.open(io.BytesIO(img_bytes))
            w, h = im.size
            name = f"{r['film_id']}"
            (dst / "images" / split / f"{name}.jpg").write_bytes(img_bytes)
            objs = r["objects"]
            lines = []
            for bbox, q, t in zip(objs["bbox"], objs["quadrant"], objs["tooth"]):
                fdi = q * 10 + t
                if fdi not in FDI_TEETH:
                    continue
                cls = FDI_TEETH.index(fdi)
                x, y, bw, bh = bbox
                lines.append(f"{cls} {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}")
            (dst / "labels" / split / f"{name}.txt").write_text("\n".join(lines) + "\n")
        print(f"teeth/{split}: {len(rows)} images")
    write_yaml(dst / "data.yaml", [str(t) for t in FDI_TEETH], "images/train", "images/val", "images/test")


def prepare_dentex_dx_test(raw: Path, out: Path) -> None:
    """DENTEX diagnosis test split remapped to DentalOS ids (only caries/periapical/impacted labelled)."""
    from PIL import Image

    dst = out / "dentex_dx_test"
    (dst / "images").mkdir(parents=True, exist_ok=True)
    (dst / "labels").mkdir(parents=True, exist_ok=True)
    rows = _parquet_rows(raw / "dentex" / "diagnosis" / "test.parquet")
    for r in rows:
        img_bytes = r["image"]["bytes"]
        w, h = Image.open(io.BytesIO(img_bytes)).size
        (dst / "images" / f"{r['film_id']}.jpg").write_bytes(img_bytes)
        objs = r["objects"]
        lines = []
        for bbox, dx in zip(objs["bbox"], objs["diagnosis"]):
            x, y, bw, bh = bbox
            cls = DENTEX_DX_TO_PATHOLOGY[int(dx)]
            lines.append(f"{cls} {(x + bw / 2) / w:.6f} {(y + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}")
        (dst / "labels" / f"{r['film_id']}.txt").write_text("\n".join(lines) + "\n")
    print(f"dentex_dx_test: {len(rows)} images")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    prepare_pathology(a.raw, a.out)
    prepare_teeth(a.raw, a.out)
    prepare_dentex_dx_test(a.raw, a.out)
