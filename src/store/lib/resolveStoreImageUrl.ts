import { getApiBaseUrl } from '@/lib/apiBase'
import { rewriteLegacyMinioUrl, canonicalProdutosImageUrl } from '@/lib/storageProdutosUrl'

/**
 * Resolve URLs de imagem para a loja pública garantindo entrega usando o proxy
 * do backend (/api/store/media) para imagens do MinIO, contornando o bloqueio (403).
 */
export function resolveStoreImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  let target = url.trim()
  
  // Primeiro, desfaz qualquer invólucro existente para podermos tratar a URL original
  if (target.includes('/api/store/media?url=')) {
    try {
      target = decodeURIComponent(target.split('/api/store/media?url=')[1])
    } catch {
      target = target.split('/api/store/media?url=')[1]
    }
  }
  
  target = rewriteLegacyMinioUrl(target)
  
  let finalUrl = target;
  
  // Tenta resolver como URL canônica do MinIO se for um caminho relativo
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    const minioUrl = canonicalProdutosImageUrl(target)
    if (minioUrl) {
      finalUrl = minioUrl
    } else {
      finalUrl = `${getApiBaseUrl()}${target.startsWith('/') ? '' : '/'}${target}`
    }
  }

  // Se a imagem estiver hospedada no nosso MinIO, DEVEMOS usar o proxy do backend
  // pois o bucket é privado (retorna 403 Forbidden no acesso direto)
  if (finalUrl.includes('minio.douradosap.com.br')) {
    return `${getApiBaseUrl()}/api/store/media?url=${encodeURIComponent(finalUrl)}`
  }

  return finalUrl
}

