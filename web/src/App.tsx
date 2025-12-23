import React, { useEffect, useRef, useState } from 'react'

type Pt = { x: number; y: number }

export default function App() {
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [designFile, setDesignFile] = useState<File | null>(null)
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [designUrl, setDesignUrl] = useState<string>('')
  const [points, setPoints] = useState<Pt[]>([])
  const [busy, setBusy] = useState(false)
  const [resultUrl, setResultUrl] = useState('')
  const [opacity, setOpacity] = useState(0.92)
  const [shading, setShading] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!baseFile) return
    const u = URL.createObjectURL(baseFile)
    setBaseUrl(u)
    setPoints([])
    setResultUrl('')
    return () => URL.revokeObjectURL(u)
  }, [baseFile])

  useEffect(() => {
    if (!designFile) return
    const u = URL.createObjectURL(designFile)
    setDesignUrl(u)
    setResultUrl('')
    return () => URL.revokeObjectURL(u)
  }, [designFile])

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !baseUrl) return

    const ctx = canvas.getContext('2d')!
    const draw = () => {
      const maxW = Math.min(900, window.innerWidth - 32)
      const scale = maxW / img.naturalWidth
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      canvas.width = w
      canvas.height = h

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      if (points.length) {
        ctx.save()
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'
        ctx.fillStyle = 'rgba(0,0,0,0.12)'

        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
        if (points.length === 4) ctx.closePath()
        ctx.stroke()
        if (points.length === 4) ctx.fill()

        for (let i = 0; i < points.length; i++) {
          const p = points[i]
          ctx.beginPath()
          ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,120,255,0.95)'
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.font = 'bold 12px system-ui'
          ctx.fillText(String(i + 1), p.x + 10, p.y - 10)
        }

        ctx.restore()
      }
    }

    if (img.complete) draw()
    img.onload = draw
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [baseUrl, points])

  function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!baseUrl) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (points.length >= 4) {
      setPoints([{ x, y }])
      return
    }
    setPoints([...points, { x, y }])
  }

  function resetPoints() {
    setPoints([])
    setResultUrl('')
  }

  async function onMockup() {
    if (!baseFile || !designFile) return
    if (points.length !== 4) {
      alert('請在底圖上依序點 4 個點：左上 → 右上 → 右下 → 左下')
      return
    }
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const scaleX = img.naturalWidth / canvas.width
    const scaleY = img.naturalHeight / canvas.height
    const pts = points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }))
    const pointsStr = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(',')

    setBusy(true)
    setResultUrl('')
    try {
      const fd = new FormData()
      fd.append('base_photo', baseFile)
      fd.append('design', designFile)
      fd.append('points', pointsStr)
      fd.append('opacity', String(opacity))
      fd.append('shading', shading ? '1' : '0')

      const r = await fetch('/api/mockup', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.result_url) setResultUrl(`/api${d.result_url}`)
      else alert(d.error || '生成失敗')
    } finally {
      setBusy(false)
    }
  }

  const canRun = !!baseFile && !!designFile && points.length === 4 && !busy

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans TC, sans-serif', padding: 16, maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ margin: '8px 0 4px' }}>T‑Shirt 圖案 Mockup MVP（平鋪照）</h1>
      <p style={{ marginTop: 0, color: '#444' }}>
        上傳空白 T 恤商品照 + 上傳圖案 → 點 4 個角 → 生成印刷預覽圖。手機也可用（拍照/相簿）。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>1) 底圖（空白 T 恤商品照/平鋪照）</h2>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setBaseFile(e.target.files?.[0] || null)}
          />
          {baseUrl && (
            <div style={{ marginTop: 12 }}>
              <img ref={imgRef} src={baseUrl} alt="base" style={{ display: 'none' }} />
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                依序點 4 點：①左上 ②右上 ③右下 ④左下（點滿後再點一次會重新開始）
              </div>
              <canvas
                ref={canvasRef}
                onClick={onCanvasClick}
                style={{ width: '100%', maxWidth: 900, borderRadius: 12, border: '1px solid #eee', touchAction: 'manipulation' }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={resetPoints} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #aaa', background: '#fff' }}>
                  重設四點
                </button>
                <span style={{ fontSize: 12, color: '#666' }}>已點：{points.length}/4</span>
              </div>
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>2) 圖案（使用者上傳）</h2>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setDesignFile(e.target.files?.[0] || null)}
          />
          {designUrl && (
            <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={designUrl} alt="design" style={{ maxHeight: 120, borderRadius: 10, border: '1px solid #eee', background: '#fafafa' }} />
              <div style={{ fontSize: 12, color: '#666' }}>
                建議 PNG 透明背景。若是白底 JPG，後續可加「自動去背」。
              </div>
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ margin: '0 0 8px' }}>3) 生成設定</h2>
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
              MVP：四點透視貼合。之後可做自動抓衣服區域，減少手動。
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
          API：<code>/api</code>（FastAPI）｜Web：Vite + React｜手機相機/相簿都能上傳
        </div>
      </div>
    </div>
  )
}
