\
from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

APP_ROOT = Path(__file__).resolve().parent
RESULTS_DIR = APP_ROOT / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="T‑Shirt Mockup MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP: open; tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")


def _rgba_pil_from_upload(up: UploadFile) -> Image.Image:
    raw = up.file.read()
    up.file.seek(0)
    return Image.open(BytesIO(raw)).convert("RGBA")


def _pil_to_bgra(img: Image.Image) -> np.ndarray:
    arr = np.array(img, dtype=np.uint8)
    return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)


def _bgra_to_pil(img_bgra: np.ndarray) -> Image.Image:
    rgba = cv2.cvtColor(img_bgra, cv2.COLOR_BGRA2RGBA)
    return Image.fromarray(rgba)


def _apply_shading(design_bgra: np.ndarray, base_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    base_gray = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    shade = (0.65 + 0.55 * base_gray)  # 0.65..1.20
    shade = np.clip(shade, 0.55, 1.25)

    out = design_bgra.copy().astype(np.float32)
    for c in range(3):  # B,G,R
        out[..., c] = out[..., c] * shade

    out[..., 3] = design_bgra[..., 3].astype(np.float32)
    out = np.clip(out, 0, 255).astype(np.uint8)

    m = (mask.astype(np.float32) / 255.0)[..., None]
    blended = (design_bgra.astype(np.float32) * (1 - m) + out.astype(np.float32) * m)
    return np.clip(blended, 0, 255).astype(np.uint8)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/mockup")
async def mockup(
    base_photo: UploadFile = File(...),
    design: UploadFile = File(...),
    points: str = Form(...),
    opacity: float = Form(0.92),
    shading: int = Form(1),
):
    # Load images
    base_pil = _rgba_pil_from_upload(base_photo)
    design_pil = _rgba_pil_from_upload(design)

    base_bgra = _pil_to_bgra(base_pil)
    design_bgra = _pil_to_bgra(design_pil)

    H, W = base_bgra.shape[:2]

    pts = [p.strip() for p in points.replace("\\n", " ").split(",") if p.strip() != ""]
    if len(pts) != 8:
        return {"error": "points must have 8 numbers (x0,y0,...,x3,y3)"}
    nums = [float(x) for x in pts]
    dst = np.array([[nums[0], nums[1]],
                    [nums[2], nums[3]],
                    [nums[4], nums[5]],
                    [nums[6], nums[7]]], dtype=np.float32)

    dh, dw = design_bgra.shape[:2]
    src = np.array([[0, 0],
                    [dw - 1, 0],
                    [dw - 1, dh - 1],
                    [0, dh - 1]], dtype=np.float32)

    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(design_bgra, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)

    alpha = warped[..., 3].copy()
    opacity = float(np.clip(opacity, 0.0, 1.0))
    alpha = (alpha.astype(np.float32) * opacity).astype(np.uint8)

    if shading:
        warped2 = warped.copy()
        warped2[..., 3] = alpha
        warped = _apply_shading(warped2, base_bgra[..., :3], (alpha > 0).astype(np.uint8) * 255)
        warped[..., 3] = alpha
    else:
        warped[..., 3] = alpha

    out = base_bgra.copy().astype(np.float32)
    w_rgb = warped[..., :3].astype(np.float32)
    a = (alpha.astype(np.float32) / 255.0)[..., None]

    out[..., :3] = out[..., :3] * (1 - a) + w_rgb * a
    out[..., 3] = 255

    out_u8 = np.clip(out, 0, 255).astype(np.uint8)

    out_id = uuid.uuid4().hex[:16]
    out_path = RESULTS_DIR / f"{out_id}.png"
    _bgra_to_pil(out_u8).save(out_path, format="PNG", optimize=True)

    return {"result_url": f"/results/{out_path.name}"}
