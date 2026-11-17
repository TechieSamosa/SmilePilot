# SmilePilot model training

## Why the old model did nothing

`dentalos_vision.onnx` (YOLOv8m, 104 MB) was trained by a notebook that merged four Kaggle datasets **without remapping
their class ids** and looked for label files next to the images (YOLO keeps them in `labels/`). Most images were
therefore trained as "background". On real panoramic films the model's highest confidence for any class was ~0.01, and
the desktop app hid this by inserting hard-coded fake findings. Both problems are fixed.

## Data (public, correctly labelled)

| Dataset | Use | Licence |
|---|---|---|
| `mostafabehroozi/panoramic_radiography_yolo_dataset_14_classes` (HF) — 1375 train / 153 val / 100 test + 180 external-clinic films | 14-class pathology & restoration detector | not stated on the dataset card — **verify before commercial use** |
| DENTEX (MICCAI 2023) via `tirandazdylan/dentex-panoramic` (HF) | FDI tooth numbering (enumeration) + external check for caries / periapical / impacted | CC BY 4.0 — cite Hamamci et al. 2023 |

Classes: implant, crown_bridge, filling, root_canal_treatment, caries, bone_loss, impacted_tooth, periapical_lesion,
root_fragment, furcation_lesion, apical_surgery, root_resorption, orthodontic_device, surgical_device.

## Run locally (GPU)

```bash
pip install ultralytics onnx onnxruntime onnxslim pyarrow opencv-python
python training/prepare_data.py --raw D:/DentalOS-train/raw --out D:/DentalOS-train/data
python training/train.py pathology --data D:/DentalOS-train/data/pathology/data.yaml
python training/train.py teeth     --data D:/DentalOS-train/data/teeth/data.yaml
```

`train.py` trains, evaluates on the held-out test split, exports ONNX (dynamic shape, opset 17), stores weights as fp16
(`compress_onnx.py`: half size, fp32 maths, verified Δscore < 0.001) and writes `app/public/models/<task>.onnx|json`
including per-class test mAP50 (shown in the app under Help).

Or on Kaggle/Colab: `notebooks/SmilePilot_Vision_Training.ipynb` (regenerate it with `python training/make_notebook.py`).

## Human-in-the-loop fine-tuning

1. The dentist reviews AI findings in the app (✓ / ✗ / edit / draw missed). Thresholds adapt on the phone immediately.
2. More → AI accuracy & learning → **Export training data** → zip (YOLO format, only fully reviewed films, plus
   `feedback.jsonl` with report/chat ratings and AI-draft → dentist-final pairs).
3. Fine-tune mixing the original data so the model does not forget — create `mix.yaml`:

   ```yaml
   path: /
   train: [D:/DentalOS-train/data/pathology/images/train, D:/feedback/images/train]
   val:   [D:/DentalOS-train/data/pathology/images/val,   D:/feedback/images/val]
   names: {0: implant, 1: crown_bridge, 2: filling, 3: root_canal_treatment, 4: caries, 5: bone_loss, 6: impacted_tooth, 7: periapical_lesion, 8: root_fragment, 9: furcation_lesion, 10: apical_surgery, 11: root_resorption, 12: orthodontic_device, 13: surgical_device}
   ```

   ```bash
   python training/train.py pathology --data mix.yaml --weights D:/DentalOS-train/runs/pathology/weights/best.pt --epochs 30
   ```
4. Ship: rebuild the APK / PWA, or send `pathology.onnx` + `pathology.json` to the dentist → Settings → Import improved model.

Note: Ultralytics is AGPL-3.0; keep the app's source available (the repo is public) or obtain an Ultralytics licence for closed distribution.

## Results of the shipped models (2026-11-17)

| Model | Held-out test mAP50 |
|---|---|
| Tooth numbering (FDI, 32 teeth), YOLOv8n @640 | **94.5%** |
| Pathology (14 classes), YOLOv8s @960 | **65.0%** overall — implant 96, surgical device 95, impacted 94, RCT 93, retained root 78, filling 77, crown/bridge 76, ortho device 70, caries 53, periapical 51, furcation 32, bone loss 31, apical surgery 1 (too few examples; hidden by default) |

External check on DENTEX test films (another source, never trained on). DENTEX boxes whole teeth, so it is scored
per tooth (`eval_tooth_level.py`): **impacted** recall 0.66 / precision 0.84; **caries** at the shipped 0.10
threshold recall 0.28 / precision 0.67; **periapical** recall 0.27 (only 11 teeth). Caries detection on films from new
clinics is the main weakness — exactly what the human-in-the-loop fine-tuning is for. Per-class default thresholds
(best F1 on validation, caries/periapical lowered for screening) are stored in `pathology.json` → `thresholds`
(`calibrate_thresholds.py`); the dentist's learned thresholds override them on her phone.
