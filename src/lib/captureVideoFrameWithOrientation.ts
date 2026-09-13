/**
 * Captura frame do <video> respeitando orientação do aparelho (retrato/paisagem),
 * como a câmera nativa: buffer landscape com telefone em pé → imagem salva em retrato.
 */

export function isViewportPortrait(): boolean {
  if (typeof window === 'undefined') return true
  const t = window.screen?.orientation?.type
  if (t) return t.startsWith('portrait')
  // fallback (Safari antigo / desktop)
  const vv = window.visualViewport
  if (vv && vv.width > 0 && vv.height > 0) {
    return vv.height >= vv.width
  }
  return window.innerHeight >= window.innerWidth
}

/**
 * Desenha o frame do vídeo no canvas com rotação se o buffer não coincidir com a orientação desejada.
 */
export function drawVideoFrameMatchingViewport(video: HTMLVideoElement, canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const wantPortrait = isViewportPortrait()
  const bufferLandscape = vw > vh
  const bufferPortrait = vh > vw

  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Telefone em pé + buffer landscape (caso típico da câmera traseira) → saída retrato
  if (wantPortrait && bufferLandscape) {
    canvas.width = vh
    canvas.height = vw
    ctx.translate(canvas.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(video, 0, 0, vw, vh)
    return ctx
  }

  // Telefone deitado + buffer retrato → saída paisagem
  if (!wantPortrait && bufferPortrait) {
    canvas.width = vh
    canvas.height = vw
    ctx.translate(0, canvas.height)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(video, 0, 0, vw, vh)
    return ctx
  }

  canvas.width = vw
  canvas.height = vh
  ctx.drawImage(video, 0, 0, vw, vh)
  return ctx
}

export function captureVideoFrameAsJpegBlob(video: HTMLVideoElement, quality = 0.85): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!video.videoWidth || !video.videoHeight) {
      resolve(null)
      return
    }
    const canvas = document.createElement('canvas')
    const ctx = drawVideoFrameMatchingViewport(video, canvas)
    if (!ctx) {
      resolve(null)
      return
    }
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/jpeg',
      quality
    )
  })
}
