import { useEffect, useState } from 'react'

export function useImage(url: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!url) { setImg(null); return }
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => setImg(i)
    i.src = url
  }, [url])

  return img
}
