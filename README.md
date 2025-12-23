# T‑Shirt Mockup MVP (Flatlay/Product Photo + User Design) — Codespaces Ready

目標：使用者上傳「空白 T 恤商品照/平鋪照」+ 上傳「圖案 PNG（透明背景）」→ 在手機瀏覽器上點 4 個角，後端透視變形把圖案合成到衣服上 → 輸出結果圖。

- ✅ 支援手機瀏覽器選照片或拍照（`capture`）
- ✅ 透視變形（四點定位）
- ✅ 基礎融合（透明度 + 亮暗跟隨衣服）

---

## GitHub Codespaces 啟動

1) 推到 GitHub repo  
2) Code → Codespaces → Create  
3) 在終端機執行：

```bash
./start-dev.sh
```

4) 打開 Ports 裡的 `5173`（Web）

---

## 使用方式（MVP）
1. 上傳底圖（空白 T 恤照片）  
2. 上傳圖案（PNG 透明背景最佳）  
3. 在底圖上依序點 4 個點：左上 → 右上 → 右下 → 左下  
4. 按「生成 Mockup」  
5. 下載/分享結果圖

---

## 下一步可升級
- 自動抓衣服區域（讓使用者不用點四點）
- 曲面/皺褶貼合（更像印在布上）
- 批次產生多張（電商上架用）
