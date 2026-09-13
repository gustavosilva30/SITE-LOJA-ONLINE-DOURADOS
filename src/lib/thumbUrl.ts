/**
 * Deriva a URL de thumbnail a partir da URL original de uma imagem do painel.
 *
 * Pipeline backend (panel_image_optimize.thumb_storage_path):
 *   painel/abc123.jpg          -> painel/thumbs/abc123.jpg
 *   painel/<id>/abc123.jpg     -> painel/<id>/thumbs/abc123.jpg
 *
 * Listagens (cards de produto, lista de chats) devem usar `thumbUrl(...)` com
 * `onError={fallbackToOriginal}` para imagens antigas (uploads anteriores ao
 * pipeline de thumb), que ainda servem o original.
 */

import { normalizeFotoDisplayUrl } from "@/lib/imagemUrls"

const PAINEL_RE = /\/painel\/([^/?#]+)$/i
const PAINEL_NESTED_RE = /\/painel\/([^/]+)\/([^/?#]+)$/i

export function thumbUrl(originalUrl: string | null | undefined): string {
  const url = (originalUrl || "").trim()
  if (!url) return ""
  // Já é thumb? Não duplica.
  if (/\/thumbs\//.test(url)) return url
  
  // Imagens geradas pelo removedor de fundo não possuem thumbnail processado.
  // Evitamos injetar '/thumbs/' nelas para prevenir erro 404.
  if (/sem-fundo-/i.test(url)) {
    // Retorna a URL normal (pode passar pelo normalizeFotoDisplayUrl se relativo)
    if (!/^https?:\/\//i.test(url)) {
      const resolved = normalizeFotoDisplayUrl(url)
      if (resolved) return resolved
    }
    return url
  }

  let result = url

  // painel/<id>/<file>
  const nested = url.match(PAINEL_NESTED_RE)
  if (nested) {
    result = url.replace(PAINEL_NESTED_RE, `/painel/${nested[1]}/thumbs/${nested[2]}`)
  } else {
    // painel/<file>
    const plain = url.match(PAINEL_RE)
    if (plain) {
      result = url.replace(PAINEL_RE, `/painel/thumbs/${plain[1]}`)
    }
  }

  // Normaliza caminhos relativos (ex.: /IMG_123.jpg ou os recém-gerados com /thumbs/) para URL completa do MinIO
  if (!/^https?:\/\//i.test(result)) {
    const resolved = normalizeFotoDisplayUrl(result)
    if (resolved) return resolved
  }
  
  return result
}

/**
 * Handler de fallback: se o thumb não existir (404), troca para o original
 * automaticamente. Aplica-se em <img onError={imgFallbackToOriginal(originalUrl)} />.
 *
 * Importante: troca o src apenas uma vez (data-fallback) para evitar loop.
 */
export function imgFallbackToOriginal(originalUrl: string | null | undefined) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.dataset.fallback === "done") return
    let orig = (originalUrl || "").trim()
    if (!orig || orig === img.src) return
    if (!/^https?:\/\//i.test(orig)) {
      const resolved = normalizeFotoDisplayUrl(orig)
      if (resolved) orig = resolved
    }
    img.dataset.fallback = "done"
    img.src = orig
  }
}
