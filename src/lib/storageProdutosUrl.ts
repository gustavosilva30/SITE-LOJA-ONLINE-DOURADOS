/**
 * Domínios MinIO legados que devem ser reescritos para o domínio atual.
 * Chave = domínio antigo, valor = domínio novo (mesmo path/bucket).
 */
const LEGACY_MINIO_DOMAIN_MAP: Record<string, string> = {
  'crm-loja.minio.douradosap.com.br': 'minio.douradosap.com.br',
}

/** Reescreve domínios legados do MinIO para o domínio atual, mantendo path e query. */
export function rewriteLegacyMinioUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const replacement = LEGACY_MINIO_DOMAIN_MAP[u.hostname]
    if (replacement) {
      u.hostname = replacement
      return u.toString()
    }
  } catch {
    // URL inválida — retorna como está
  }
  return raw
}

const BUCKET = "produtos"

function decodePathSegments(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .join("/")
}

/** Uma ou mais bases públicas MinIO (ex.: https://minio.douradosap.com.br/produtos), separadas por vírgula. */
function minioPublicBases(): string[] {
  const raw = import.meta.env.VITE_MINIO_PUBLIC_URL?.trim()
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean)
}

/**
 * Chave do objeto a partir da URL pública MinIO, para uma base concreta
 * (MINIO_PUBLIC_URL no backend = mesma origem/path que VITE_MINIO_PUBLIC_URL no frontend).
 */
function objectPathFromSingleMinioBase(url: string, base: string): string | null {
  try {
    const u = new URL(url.trim())
    const b = new URL(base.includes("://") ? base : `https://${base}`)
    if (u.origin !== b.origin) return null
    const basePath = b.pathname.replace(/\/$/, "") || ""
    const p = u.pathname
    if (basePath) {
      if (p === basePath) return null
      if (!p.startsWith(basePath + "/")) return null
      const rest = p.slice(basePath.length + 1)
      if (!rest) return null
      return decodePathSegments(rest)
    }
    const trimmed = p.replace(/^\//, "")
    if (!trimmed) return null
    return decodePathSegments(trimmed)
  } catch {
    return null
  }
}

/**
 * Chave do objeto (ex.: product-images/foo.jpg) a partir da URL pública MinIO.
 */
export function objectPathFromMinioPublicUrl(url: string): string | null {
  for (const base of minioPublicBases()) {
    const p = objectPathFromSingleMinioBase(url, base)
    if (p) return p
  }
  return null
}

/**
 * Extrai a chave no bucket `produtos` a partir da URL pública do Supabase Storage ou MinIO.
 */
export function objectPathFromProdutosStoragePublicUrl(url: string): string | null {
  try {
    const pathname = new URL(url.trim()).pathname
    const m = pathname.match(/\/(?:storage\/v1\/)?object\/(?:public|sign)\/produtos\/(.+)$/i)
    if (m?.[1]) {
      return decodePathSegments(m[1])
    }
  } catch {
    return null
  }
  return objectPathFromMinioPublicUrl(url)
}

export function canonicalMinioProdutosUrl(key: string): string | null {
  const bases = minioPublicBases()
  if (!bases.length || !key) return null
  const k = normalizeBucketObjectKey(key)
  if (!k) return null
  const enc = k.split("/").map((seg) => encodeURIComponent(seg)).join("/")
  return `${bases[0]}/${enc}`
}

/** Remove prefixo duplicado `produtos/` se alguém guardou caminho com nome do bucket. */
function normalizeBucketObjectKey(key: string): string {
  let k = key.replace(/^\/+/, "").trim()
  const lower = k.toLowerCase()
  if (
    lower.startsWith("produtos/painel/") ||
    lower.startsWith("produtos/uploads/") ||
    lower.startsWith("produtos/import-estoque/") ||
    lower.startsWith("produtos/import-sucata/")
  ) {
    return k
  }
  if (lower.startsWith(`${BUCKET}/`)) {
    k = k.slice(BUCKET.length + 1)
  }
  return k
}

function isKeyMigradoParaMinio(key: string): boolean {
  if (!key) return false
  // Arquivos de background-removal gerados localmente (sem upload ao MinIO)
  if (key.includes("product-images/")) return false
  if (key.includes("-limpa.")) return false
  // Thumbs de sem-fundo no path painel/.../thumbs/sem-fundo-*.jpg nunca foram criados
  // (fluxo Python que os geraria não foi concluído). Bloqueamos apenas o sub-path /thumbs/
  // para evitar 404 no browser. Sem-fundo diretos (ex.: <id>/sem-fundo-*.jpg) são válidos.
  if (/\/thumbs\/sem-fundo.*\.jpg$/i.test(key)) return false
  // Arquivos de sucata/import usam timestamp no nome — são válidos no MinIO
  return true
}

/**
 * Reconstrói URL canónica a partir de VITE_MINIO_PUBLIC_URL.
 * Corrige encoding, paths relativos e URLs `//...`.
 */
export function canonicalProdutosImageUrl(raw: string): string {
  const t = rewriteLegacyMinioUrl(
    String(raw || "")
      .trim()
      .replace(/^\uFEFF/, "")
  )
  if (!t) return ""
  if (t.startsWith("data:") || t.startsWith("blob:")) return t


  const resolveKey = (pathKey: string): string => {
    const key = normalizeBucketObjectKey(pathKey)
    if (!isKeyMigradoParaMinio(key)) return ""
    const minio = canonicalMinioProdutosUrl(key)
    if (minio) return minio
    return ""
  }

  if (/^https?:\/\//i.test(t)) {
    const path = objectPathFromProdutosStoragePublicUrl(t)
    if (path) return resolveKey(path)
    return isKeyMigradoParaMinio(t) ? t : ""
  }

  if (t.startsWith("//")) {
    const path = objectPathFromProdutosStoragePublicUrl(`https:${t}`)
    if (path) return resolveKey(path)
    const out = `https:${t}`
    return isKeyMigradoParaMinio(out) ? out : ""
  }

  if (!t.includes("://")) {
    const key = normalizeBucketObjectKey(t)
    if (key && !/\s/.test(key)) {
      return resolveKey(key)
    }
  }

  return isKeyMigradoParaMinio(t) ? t : ""
}
