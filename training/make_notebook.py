"""Regenerate notebooks/SmilePilot_Vision_Training.ipynb from the training scripts (keeps them in sync)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "notebooks" / "SmilePilot_Vision_Training.ipynb"


def md(s):
    return {"cell_type": "markdown", "metadata": {}, "source": s}


def code(s):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s}


def writefile(name):
    return code(f"%%writefile {name}\n" + (HERE / name).read_text(encoding="utf-8"))


cells = [
    md(
        "# DentalOS on-device X-ray models — training (Kaggle / Colab GPU)\n\n"
        "Trains the two models that run inside the DentalOS phone app:\n"
        "1. **pathology** — YOLOv8s, 14 classes (caries, periapical lesion, bone loss, impacted tooth, fillings, crowns, RCT, implants…) at 960 px\n"
        "2. **teeth** — YOLOv8n FDI tooth numbering (32 teeth) at 640 px\n\n"
        "Data (public, correctly labelled): `mostafabehroozi/panoramic_radiography_yolo_dataset_14_classes` and DENTEX (`tirandazdylan/dentex-panoramic`, CC BY 4.0).\n\n"
        "**Why the old notebook failed:** it merged datasets without remapping class ids and looked for labels next to the images, so the model "
        "trained on (almost) no labels and output ~1% confidence on real films.\n\n"
        "Outputs in `/kaggle/working/models`: `pathology.onnx/.json`, `teeth.onnx/.json` → copy into `app/public/models/` and rebuild, "
        "or import them in the app (Settings → Import improved model).\n\n"
        "Enable **GPU** and **Internet** in the notebook settings."
    ),
    code("!pip install -q ultralytics onnx onnxruntime onnxslim pyarrow huggingface_hub opencv-python-headless"),
    code(
        "from huggingface_hub import hf_hub_download\nimport zipfile, os\n"
        "RAW='/kaggle/working/raw'; os.makedirs(RAW+'/dentex', exist_ok=True)\n"
        "z = hf_hub_download('mostafabehroozi/panoramic_radiography_yolo_dataset_14_classes', 'panoramic_radiography_yolo_dataset_14_classes.zip', repo_type='dataset')\n"
        "zipfile.ZipFile(z).extractall(RAW+'/pano14')\n"
        "for cfg in ['diagnosis','enumeration']:\n"
        "    os.makedirs(f'{RAW}/dentex/{cfg}', exist_ok=True)\n"
        "    for split in ['train','validation','test']:\n"
        "        p = hf_hub_download('tirandazdylan/dentex-panoramic', f'{cfg}/{split}-00000-of-00001.parquet', repo_type='dataset')\n"
        "        os.system(f'cp {p} {RAW}/dentex/{cfg}/{split}.parquet')\n"
        "print(os.listdir(RAW+'/pano14'))"
    ),
    writefile("prepare_data.py"),
    code("!python prepare_data.py --raw /kaggle/working/raw --out /kaggle/working/data"),
    writefile("compress_onnx.py"),
    writefile("train.py"),
    md("## Train (≈1–2 h on a T4)"),
    code(
        "!python train.py pathology --data /kaggle/working/data/pathology/data.yaml --project /kaggle/working/runs --out /kaggle/working/models --batch 16 --workers 4 --cache ram"
    ),
    code(
        "!python train.py teeth --data /kaggle/working/data/teeth/data.yaml --project /kaggle/working/runs --out /kaggle/working/models --batch 32 --workers 4 --cache ram"
    ),
    md(
        "## External check on DENTEX (caries / periapical / impacted)\n"
        "The DENTEX test films were never seen in training — this is the honest estimate for those three findings."
    ),
    code(
        "from ultralytics import YOLO\n"
        "import yaml\n"
        "names = YOLO('/kaggle/working/runs/pathology/weights/best.pt').names\n"
        "yaml.safe_dump({'path':'/kaggle/working/data/dentex_dx_test','train':'images','val':'images','names':names}, open('dentex.yaml','w'))\n"
        "m = YOLO('/kaggle/working/runs/pathology/weights/best.pt').val(data='dentex.yaml', imgsz=960, batch=8, classes=[4,6,7])\n"
        "print({names[i]: round(float(v),3) for i, v in zip(m.box.ap_class_index, m.box.ap50)})"
    ),
    md(
        "## Fine-tune with dentist-reviewed data from the app (human-in-the-loop)\n"
        "In the app: More → AI accuracy & learning → Export training data. Upload the zip as a Kaggle dataset, then:"
    ),
    code(
        "# !unzip -q /kaggle/input/<your-export>/dentalos_training_*.zip -d /kaggle/working/feedback\n"
        "# Mix with the original data so the model does not forget:\n"
        "# !python train.py pathology --data /kaggle/working/feedback/data.yaml --weights /kaggle/working/runs/pathology/weights/best.pt --epochs 30 --batch 16 --project /kaggle/working/runs_ft --out /kaggle/working/models_ft"
    ),
]

nb = {
    "cells": cells,
    "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}},
    "nbformat": 4,
    "nbformat_minor": 5,
}
OUT.write_text(json.dumps(nb, indent=1), encoding="utf-8")
print("wrote", OUT)
