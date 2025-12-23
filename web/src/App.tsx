import React, { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KImage, Transformer } from 'react-konva'
import Konva from 'konva'
import { useImage } from './useImage'

type Pt = { x: number; y: number }
function clamp(n:number,a:number,b:number){ return Math.max(a, Math.min(b,n)) }

export default function App() {
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [designFile, setDesignFile] = useState<File | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [designUrl, setDesignUrl] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [busy, setBusy] = useState(false)

  // settings
  const [opacity, setOpacity] = useState(0.95)
  const [shading, setShading] = useState(true)
  const [shadingStrength, setShadingStrength] = useState(0.6)

  const [bgMode, setBgMode] = useState<'none'|'auto'|'white'|'black'>('auto')
  const [bgThr, setBgThr] = useState(35)

  // stage sizing
  const [stageW, setStageW] = useState(360)
  const [stageH, setStageH] = useState(360)

  const baseImg = useImage(baseUrl)
  const designImg = useImage(designUrl)

  const designRef = useRef<Konva.Image>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [selected, setSelected] = useState(false)

  useEffect(() => {
    if (!baseFile) return
    const u = URL.createObjectURL(baseFile)
    setBaseUrl(u)
    setResultUrl('')
    setSelected(false)
    return () => URL.revokeObjectURL(u)
  }, [baseFile])

  useEffect(() => {
    if (!designFile) return
    const u = URL.createObjectURL(designFile)
    setDesignUrl(u)
    setResultUrl('')
    setSelected(true)
    return () => URL.revokeObjectURL(u)
  }, [designFile])

  useEffect(() => {
    if (!baseImg) return
    const maxW = Math.min(900, window.innerWidth - 32)
    const scale = maxW / baseImg.naturalWidth
    setStageW(Math.round(baseImg.naturalWidth * scale))
    setStageH(Math.round(baseImg.naturalHeight * scale))
  }, [baseImg])

  useEffect(() => {
    const onResize = () => {
      if (!baseImg) return
      const maxW = Math.min(900, window.innerWidth - 32)
      const scale = maxW / baseImg.naturalWidth
      setStageW(Math.round(baseImg.naturalWidth * scale))
      setStageH(Math.round(baseImg.naturalHeight * scale))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [baseImg])

  useEffect(() => {
    if (!selected || !trRef.current || !designRef.current) return
    trRef.current.nodes([designRef.current])
    trRef.current.getLayer()?.batchDraw()
  }, [selected, designImg, stageW, stageH])

  useEffect(() => {
    if (!baseImg || !designImg || !designRef.current) return
    const node = designRef.current
    const targetW = stageW * 0.40
    const scale = targetW / designImg.naturalWidth
    node.width(designImg.naturalWidth)
    node.height(designImg.naturalHeight)
    node.scale({ x: scale, y: scale })
    node.position({ x: stageW * 0.30, y: stageH * 0.35 })
    node.rotation(0)
    node.draggable(true)
    setSelected(true)
  }, [baseImg, designImg, stageW, stageH])

  function getDesignCornerPointsInStage(): Pt[] | null {
    const node = designRef.current
    if (!node) return null
    const transform = node.getAbsoluteTransform().copy()
    const tl = transform.point({ x: 0, y: 0 })
    const tr = transform.point({ x: node.width(), y: 0 })
    const br = transform.point({ x: node.width(), y: node.height() })
    const bl = transform.point({ x: 0, y: node.height() })
    return [tl, tr, br, bl]
  }

async function onMockup() {
  if (!baseFile || !designFile || !baseImg || !designImg) return

  // ✅ 1) 強制把 Konva 最後一個拖拉/變形 frame 結算
  const node = designRef.current
  node?.getLayer()?.batchDraw()
  node?.getStage()?.batchDraw()

  const ptsStage = getDesignCornerPointsInStage()
  if (!ptsStage) return

  const scaleX = baseImg.naturalWidth / stageW
  const scaleY = baseImg.naturalHeight / stageH
  const pts = ptsStage.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
  const pointsStr = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(',')

  setBusy(true)
  setResultUrl('')
  try {
    const fd = new FormData()
    fd.append('base_photo', baseFile)
    fd.append('design', designFile)
    fd.append('points', pointsStr)
    fd.append('opacity', String(clamp(opacity, 0, 1)))
    fd.append('shading', shading ? '1' : '0')
    fd.append('shading_strength', String(clamp(shadingStrength, 0, 1)))
    fd.append('bg_mode', bgMode)
    fd.append('bg_thr', String(clamp(bgThr, 0, 100)))

    const r = await fetch('/api/mockup', { method: 'POST', body: fd })
    const d = await r.json()

    // ✅ 2) cache-busting，避免 <img> 顯示上一張
    if (d.result_url) setResultUrl(`/api${d.result_url}?v=${Date.now()}`)
    else alert(d.error || '生成失敗')
  } finally {
    setBusy(false)
  }
}


  const canRun = !!baseFile && !!designFile && !busy

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans TC, sans-serif', padding: 16, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ margin: '8px 0 4px' }}>T‑Shirt 圖案 Mockup MVP（拖拉框 + 去背模式）</h1>
      <p style={{ marginTop: 0, color: '#444' }}>
        上傳空白 T 恤商品照 + 圖案 → 拖拉/縮放/旋轉 → 去背（Auto/去白/去黑）→ 生成印刷預覽圖。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>1) 底圖</h2>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setBaseFile(e.target.files?.[0] || null)} />
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>2) 圖案（使用者上傳）</h2>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setDesignFile(e.target.files?.[0] || null)} />
          {designUrl && (
            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={designUrl} alt="design" style={{ maxHeight: 120, borderRadius: 10, border: '1px solid #eee', background: '#fafafa' }} />
              <div style={{ fontSize: 12, color: '#666' }}>
                若圖案不是透明 PNG，可用「去背模式」把白底/黑底去掉（Auto 通常最好用）。
              </div>
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>3) 位置調整（拖拉 / 縮放 / 旋轉）</h2>

          {baseImg && (
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                點一下圖案會出現控制框；拖曳移動、拉角落縮放、旋轉把手旋轉。
              </div>

              <Stage
                width={stageW}
                height={stageH}
                style={{ width: '100%', maxWidth: 900, borderRadius: 12, border: '1px solid #eee', background: '#fff', touchAction: 'none' }}
                onMouseDown={(e) => {
                  const clickedOnEmpty = e.target === e.target.getStage()
                  if (clickedOnEmpty) setSelected(false)
                }}
                onTouchStart={(e) => {
                  const clickedOnEmpty = e.target === e.target.getStage()
                  if (clickedOnEmpty) setSelected(false)
                }}
              >
                <Layer>
                  <KImage image={baseImg} x={0} y={0} width={stageW} height={stageH} listening={false} />
                  {designImg && (
                    <KImage
                      image={designImg}
                      ref={designRef}
                      onClick={() => setSelected(true)}
                      onTap={() => setSelected(true)}
                      draggable
                    />
                  )}
                  {selected && designImg && (
                    <Transformer
                      ref={trRef}
                      rotateEnabled
                      enabledAnchors={['top-left','top-right','bottom-left','bottom-right']}
                      anchorSize={12}
                      borderDash={[6, 3]}
                      keepRatio={true}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 20 || newBox.height < 20) return oldBox
                        return newBox
                      }}
                    />
                  )}
                </Layer>
              </Stage>
            </div>
          )}

          {!baseImg && <div style={{ fontSize: 12, color: '#666' }}>先上傳底圖後才會顯示可拖拉的畫布。</div>}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>4) 生成設定</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              不透明度：{opacity.toFixed(2)}
              <input type="range" min="0.2" max="1" step="0.01" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} style={{ width: '100%' }} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={shading} onChange={(e) => setShading(e.target.checked)} />
              亮暗跟隨衣服（紋理/皺褶）
            </label>

            <label>
              亮暗強度：{shadingStrength.toFixed(2)}
              <input type="range" min="0" max="1" step="0.01" value={shadingStrength} onChange={(e) => setShadingStrength(parseFloat(e.target.value))} style={{ width: '100%' }} />
            </label>

            <label>
              去背模式：
              <select value={bgMode} onChange={(e) => setBgMode(e.target.value as any)} style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px solid #ccc' }}>
                <option value="auto">Auto（推薦）</option>
                <option value="white">去白底</option>
                <option value="black">去黑底</option>
                <option value="none">不去背</option>
              </select>
            </label>

            <label>
              去背強度：{bgThr}
              <input type="range" min="0" max="100" step="1" value={bgThr} onChange={(e) => setBgThr(parseInt(e.target.value, 10))} style={{ width: '100%' }} />
            </label>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              disabled={!canRun}
              onClick={onMockup}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #111',
                background: canRun ? '#111' : '#aaa',
                color: '#fff',
                cursor: canRun ? 'pointer' : 'not-allowed'
              }}
            >
              {busy ? '生成中…' : '生成 Mockup'}
            </button>
            <span style={{ color: '#666', fontSize: 13 }}>
              建議：去背 Auto、強度 35～55；若吃到黑線稿就降低強度或改「不去背」。
            </span>
          </div>

          {resultUrl && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: '8px 0' }}>結果</h3>
              <img src={resultUrl} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid #eee' }} />
              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href={resultUrl} download="mockup.png" style={{ color: '#111' }}>下載圖片</a>
                <a href={resultUrl} target="_blank" rel="noreferrer" style={{ color: '#111' }}>在新分頁開啟</a>
              </div>
            </div>
          )}
        </section>

        <div style={{ color: '#666', fontSize: 12 }}>
          API：<code>/api</code>（FastAPI）｜Web：Vite + React + Konva
        </div>
      </div>
    </div>
  )
}
