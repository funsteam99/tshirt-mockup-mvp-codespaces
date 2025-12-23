import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  const [opacity, setOpacity] = useState(0.92)
  const [shading, setShading] = useState(true)

  // stage sizing
  const [stageW, setStageW] = useState(360)
  const [stageH, setStageH] = useState(360)

  const baseImg = useImage(baseUrl)
  const designImg = useImage(designUrl)

  const designRef = useRef<Konva.Image>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [selected, setSelected] = useState(false)

  // create object URLs
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

  // stage size based on base image and viewport
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

  // attach transformer to design
  useEffect(() => {
    if (!selected || !trRef.current || !designRef.current) return
    trRef.current.nodes([designRef.current])
    trRef.current.getLayer()?.batchDraw()
  }, [selected, designImg, stageW, stageH])

  // initialize design position/size when both images available
  useEffect(() => {
    if (!baseImg || !designImg || !designRef.current) return
    const node = designRef.current
    // put at center with reasonable width (~40% of stage)
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
    // normalize: apply scale into width/height then reset scale to 1 so math is stable
    const w = node.width() * node.scaleX()
    const h = node.height() * node.scaleY()
    const transform = node.getAbsoluteTransform().copy()

    // Because Konva's transform includes scaling, we can just transform base corners using current transform
    // But the local corners should be defined on the original width/height (not scaled) if transform already scales.
    // We'll use local corners (0,0)-(width,height) and let transform handle scaling.
    const tl = transform.point({ x: 0, y: 0 })
    const tr = transform.point({ x: node.width(), y: 0 })
    const br = transform.point({ x: node.width(), y: node.height() })
    const bl = transform.point({ x: 0, y: node.height() })
    return [tl, tr, br, bl]
  }

  async function onMockup() {
    if (!baseFile || !designFile || !baseImg || !designImg) return
    const ptsStage = getDesignCornerPointsInStage()
    if (!ptsStage) return

    // Map stage (display) -> original base image pixels
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

      const r = await fetch('/api/mockup', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.result_url) setResultUrl(`/api${d.result_url}`)
      else alert(d.error || '生成失敗')
    } finally {
      setBusy(false)
    }
  }

  const canRun = !!baseFile && !!designFile && !busy

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans TC, sans-serif', padding: 16, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ margin: '8px 0 4px' }}>T‑Shirt 圖案 Mockup MVP（拖拉框版）</h1>
      <p style={{ marginTop: 0, color: '#444' }}>
        上傳空白 T 恤商品照 + 圖案 → 直接拖拉/縮放/旋轉 → 生成印刷預覽圖。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>1) 底圖（空白 T 恤商品照/平鋪照）</h2>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setBaseFile(e.target.files?.[0] || null)} />
          {!baseUrl ? (
            <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>先上傳底圖，下面會出現可編輯畫布。</div>
          ) : null}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>2) 圖案（使用者上傳）</h2>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setDesignFile(e.target.files?.[0] || null)} />
          {designUrl && (
            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={designUrl} alt="design" style={{ maxHeight: 120, borderRadius: 10, border: '1px solid #eee', background: '#fafafa' }} />
              <div style={{ fontSize: 12, color: '#666' }}>
                建議 PNG 透明背景。點一下圖案會出現控制框；拖曳移動、拉角落縮放、旋轉把手旋轉。
              </div>
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>3) 位置調整（直接拖拉框）</h2>

          {baseImg && (
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                直接拖曳圖案到胸口。若沒看到控制框，點一下圖案即可。
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
                  {/* base image */}
                  <KImage image={baseImg} x={0} y={0} width={stageW} height={stageH} listening={false} />
                  {/* design image */}
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
                        // limit size
                        if (newBox.width < 20 || newBox.height < 20) return oldBox
                        return newBox
                      }}
                    />
                  )}
                </Layer>
              </Stage>
            </div>
          )}

          {!baseImg && (
            <div style={{ fontSize: 12, color: '#666' }}>
              先上傳底圖後才會顯示可拖拉的畫布。
            </div>
          )}
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
              亮暗跟隨衣服（更像印上去）
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
              這版已是「商用操作感」。下一步可加：去背、自動胸口定位、皺褶貼合。
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
          API：<code>/api</code>（FastAPI）｜Web：Vite + React + Konva（拖拉/縮放/旋轉）
        </div>
      </div>
    </div>
  )
}
