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


def _remove_bg_keying(design_bgra: np.ndarray, mode: str = "none", thr: int = 35) -> np.ndarray:
    '''
    MVP 去背（非AI）：
    - none : 不處理
    - white: 去接近白的像素
    - black: 去接近黑的像素
    - auto : 用四個角落判斷背景偏白或偏黑
    thr: 0~100（越大越容易去掉）
    '''
    mode = (mode or "none").lower().strip()
    if mode == "none":
        return design_bgra

    thr = int(np.clip(int(thr), 0, 100))
    dist_thr = thr / 100.0 * 255.0

    b = design_bgra[..., 0].astype(np.float32)
    g = design_bgra[..., 1].astype(np.float32)
    r = design_bgra[..., 2].astype(np.float32)
    a = design_bgra[..., 3].astype(np.float32)

    if mode == "auto":
        h, w = design_bgra.shape[:2]
        k = max(6, min(20, min(h, w) // 10))
        corners = np.concatenate(
            [
                design_bgra[0:k, 0:k, :3].reshape(-1, 3),
                design_bgra[0:k, -k:, :3].reshape(-1, 3),
                design_bgra[-k:, 0:k, :3].reshape(-1, 3),
                design_bgra[-k:, -k:, :3].reshape(-1, 3),
            ],
            axis=0,
        ).astype(np.float32)
        lum = 0.114 * corners[:, 0] + 0.587 * corners[:, 1] + 0.299 * corners[:, 2]
        mean_lum = float(np.mean(lum))
        mode = "white" if mean_lum > 127 else "black"

    if mode == "white":
        dist = np.sqrt((r - 255) ** 2 + (g - 255) ** 2 + (b - 255) ** 2)
    elif mode == "black":
        dist = np.sqrt((r - 0) ** 2 + (g - 0) ** 2 + (b - 0) ** 2)
    else:
        return design_bgra

    # soft edge: dist<=t0 => alpha->0 ; dist>=t1 => alpha keep
    t0 = float(dist_thr)
    t1 = float(dist_thr * 1.6 + 1e-6)
    keep = np.clip((dist - t0) / (t1 - t0), 0.0, 1.0)
    a2 = a * keep

    out = design_bgra.copy()
    out[..., 3] = np.clip(a2, 0, 255).astype(np.uint8)
    return out


def _apply_shading_detail(design_bgra: np.ndarray, base_bgr: np.ndarray, mask: np.ndarray, strength: float = 0.6) -> np.ndarray:
    '''
    改良版 shading：只跟隨衣服的「紋理/皺褶」，避免全局亮暗把圖案搞灰。
    detail = gray / blur(gray) (high-pass)
    '''
    strength = float(np.clip(strength, 0.0, 1.0))

    gray = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    blur = cv2.GaussianBlur(gray, (51, 51), 0)
    blur = np.clip(blur, 1e-3, 1.0)

    detail = gray / blur
    detail = cv2.GaussianBlur(detail, (7, 7), 0)
    detail = np.clip(detail, 0.75, 1.25)

    shade = (1.0 - strength) + strength * detail

    out = design_bgra.copy().astype(np.float32)
    for c in range(3):
        out[..., c] = out[..., c] * shade
    out[..., 3] = design_bgra[..., 3].astype(np.float32)
    out = np.clip(out, 0, 255).astype(np.uint8)

    m = (mask.astype(np.float32) / 255.0)[..., None]
    blended = design_bgra.astype(np.float32) * (1 - m) + out.astype(np.float32) * m
    return np.clip(blended, 0, 255).astype(np.uint8)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/mockup")
async def mockup(
    base_photo: UploadFile = File(...),
    design: UploadFile = File(...),
    points: str = Form(...),  # x0,y0,x1,y1,x2,y2,x3,y3 in base original pixels
    opacity: float = Form(0.95),
    shading: int = Form(1),
    shading_strength: float = Form(0.6),
    bg_mode: str = Form("auto"),  # none | auto | white | black
    bg_thr: int = Form(35),       # 0..100
):
    base_pil = _rgba_pil_from_upload(base_photo)
    design_pil = _rgba_pil_from_upload(design)

    base_bgra = _pil_to_bgra(base_pil)
    design_bgra = _pil_to_bgra(design_pil)

    # background removal (keying)
    design_bgra = _remove_bg_keying(design_bgra, mode=bg_mode, thr=bg_thr)

    # ✅ NEW: 找出底圖「非透明」的衣服本體區域，避免透明 padding 造成座標錯置
    base_alpha = base_bgra[..., 3]
    ys, xs = np.where(base_alpha > 0)

    # 如果底圖沒有透明（例如 JPG 或 alpha 全滿），就用整張圖
    if len(xs) == 0 or len(ys) == 0:
        x0, y0, x1, y1 = 0, 0, base_bgra.shape[1], base_bgra.shape[0]
    else:
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1

    # 裁出衣服本體區（之後透視、shading 都在這個區域做）
    base_crop = base_bgra[y0:y1, x0:x1].copy()
    Hc, Wc = base_crop.shape[:2]

    pts = [p.strip() for p in points.replace("\n", " ").split(",") if p.strip() != ""]
    if len(pts) != 8:
        return {"error": "points must have 8 numbers (x0,y0,...,x3,y3)"}
    nums = [float(x) for x in pts]
    dst = np.array(
        [
            [nums[0], nums[1]],
            [nums[2], nums[3]],
            [nums[4], nums[5]],
            [nums[6], nums[7]],
        ],
        dtype=np.float32,
    )
    # ✅ NEW: points 轉成「裁切後」的座標（減掉 padding 偏移）
    dst[:, 0] -= x0
    dst[:, 1] -= y0

    dh, dw = design_bgra.shape[:2]
    src = np.array([[0, 0], [dw - 1, 0], [dw - 1, dh - 1], [0, dh - 1]], dtype=np.float32)

    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(
        design_bgra, M, (Wc, Hc),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_TRANSPARENT
    )

    alpha = warped[..., 3].copy()
    opacity = float(np.clip(opacity, 0.0, 1.0))
    alpha = (alpha.astype(np.float32) * opacity).astype(np.uint8)
    # ✅ 防呆：opacity 太低時，shading 會很容易把底圖紋理放大造成「混亂」
    if opacity < 0.75:
        shading = 0
    if int(shading) == 1:
        warped2 = warped.copy()
        warped2[..., 3] = alpha
        warped = _apply_shading_detail(
            warped2,
            base_crop[..., :3],
            (alpha > 0).astype(np.uint8) * 255,
            strength=float(shading_strength),
        )
        warped[..., 3] = alpha
    else:
        warped[..., 3] = alpha

    out = base_crop.copy().astype(np.float32)
    w_rgb = warped[..., :3].astype(np.float32)
    a = (alpha.astype(np.float32) / 255.0)[..., None]

    out[..., :3] = out[..., :3] * (1 - a) + w_rgb * a
    out[..., 3] = 255

    out_u8 = np.clip(out, 0, 255).astype(np.uint8)
    # ✅ NEW: 把裁切區合成結果貼回原底圖
    final = base_bgra.copy()
    final[y0:y1, x0:x1] = out_u8
    out_u8 = final

    out_id = uuid.uuid4().hex[:16]
    out_path = RESULTS_DIR / f"{out_id}.png"
    _bgra_to_pil(out_u8).save(out_path, format="PNG", optimize=True)

    return {"result_url": f"/results/{out_path.name}"}
