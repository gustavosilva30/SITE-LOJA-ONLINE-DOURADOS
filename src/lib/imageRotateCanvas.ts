/**
 * Gera um Blob da imagem rotacionada em múltiplos de 90° (pixels reais, para persistir no storage).
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem (rede ou bloqueio CORS)."))
    img.src = src
  })
}

function normalizeDeg90(rotationDeg: number): 0 | 90 | 180 | 270 {
  const n = Math.round(rotationDeg) % 360
  const x = ((n % 360) + 360) % 360
  if (x === 0 || x === 90 || x === 180 || x === 270) return x as 0 | 90 | 180 | 270
  const snapped = (Math.round(x / 90) * 90) % 360
  return snapped as 0 | 90 | 180 | 270
}

/** MIME de saída: PNG preserva transparência (ex.: fundo removido). */
export async function rotatedImageBlob(
  src: string,
  rotationDeg: number,
  mime: "image/png" | "image/jpeg" = "image/png",
  jpegQuality = 0.92
): Promise<Blob> {
  const deg = normalizeDeg90(rotationDeg)

  const img = await loadImage(src)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) throw new Error("Imagem com dimensões inválidas.")

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas não disponível.")

  if (deg === 0) {
    canvas.width = w
    canvas.height = h
    ctx.drawImage(img, 0, 0)
  } else if (deg % 180 !== 0) {
    canvas.width = h
    canvas.height = w
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((deg * Math.PI) / 180)
    ctx.drawImage(img, -w / 2, -h / 2)
  } else {
    canvas.width = w
    canvas.height = h
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((deg * Math.PI) / 180)
    ctx.drawImage(img, -w / 2, -h / 2)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))),
      mime,
      mime === "image/jpeg" ? jpegQuality : undefined
    )
  })
}
