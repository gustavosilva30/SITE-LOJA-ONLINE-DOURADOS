/**
 * Normaliza leitura de imagem_urls do Supabase/Postgres:
 * pode vir como string[] (correto), string JSON, ou string única.
 */

export function normalizeUrlForMatch(u: string): string {
  try {
    const x = new URL(u.trim())
    return `${x.origin}${x.pathname}`.replace(/\/$/, "")
  } catch {
    return u.trim()
  }
}

/**
 * Chave de dedupe para galerias: remove hash e, para URLs do nosso Storage, remove também querystring.
 * Motivo: a mesma imagem pode aparecer como `...jpg`, `...jpg?width=800`, etc.
 */
export function normalizeUrlForGalleryDedupe(u: string): string {
  const t = String(u || "").trim()
  if (!t) return ""
  try {
    const x = new URL(t)
    x.hash = ""
    // Para o nosso Storage (Supabase/MinIO), a query não altera o ficheiro (só cache/transform).
    if (
      x.pathname.includes("/storage/v1/object/public/produtos/") ||
      x.pathname.includes("/produtos/")
    ) {
      x.search = ""
    }
    return `${x.origin}${x.pathname}${x.search}`.replace(/\/$/, "")
  } catch {
    return t
  }
}

/** `sucatas.fotos` (jsonb): mesmas variações que `imagem_urls` em produtos. */
export function parseSucataFotos(value: unknown): string[] {
  return parseImagemUrls(value)
}

/**
 * URL usável em `<img src>`: trim, URLs protocol-relative (`//`), e caminhos relativos do bucket `produtos`.
 * Preserva URLs legadas que não casam com os prefixos conhecidos (fallback no fim).
 */
export function normalizeFotoDisplayUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let t = String(raw).trim().replace(/^\uFEFF/, "")
  if (!t) return null
  if (t.startsWith("data:")) return t
  if (t.startsWith("//")) return `https:${t}`
  if (/^https?:\/\//i.test(t)) return t

  const minioPublicUrl = import.meta.env.VITE_MINIO_PUBLIC_URL as string | undefined
  const minioNorm = minioPublicUrl?.trim().replace(/\/$/, "")
  const storageProdutosBase = minioNorm
    ? minioNorm.endsWith("/produtos")
      ? minioNorm
      : `${minioNorm}/produtos`
    : undefined
  if (
    storageProdutosBase &&
    !/\s/.test(t) &&
    !t.includes("://") &&
    (t.startsWith("sucatas/") ||
      t.startsWith("import-sucata/") ||
      t.startsWith("import-estoque/") ||
      t.startsWith("catalog-templates/"))
  ) {
    const segs = t.split("/").map((seg) => encodeURIComponent(seg))
    return `${storageProdutosBase}/${segs.join("/")}`
  }

  // Qualquer caminho relativo tipo pasta/ficheiro (sem espaços) → bucket produtos
  if (
    storageProdutosBase &&
    !/\s/.test(t) &&
    !t.includes("://") &&
    /^[a-zA-Z0-9_\-./]+$/.test(t) &&
    t.includes("/")
  ) {
    let cleanT = t.replace(/^\/+/, "").trim()
    if (cleanT.toLowerCase().startsWith("produtos/")) {
      cleanT = cleanT.slice(9)
    }
    const segs = cleanT.split("/").map((seg) => encodeURIComponent(seg))
    return `${storageProdutosBase}/${segs.join("/")}`
  }

  // Último recurso: não descartar — muitas fotos antigas ainda carregam com o texto bruto
  return t
}

export function parseImagemUrls(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
  }
  if (typeof value === "string") {
    const s = value.trim()
    if (!s) return []
    if (s.startsWith("[")) {
      try {
        const j = JSON.parse(s) as unknown
        if (Array.isArray(j)) {
          return j.filter((x): x is string => typeof x === "string" && String(x).trim().length > 0)
        }
      } catch {
        /* não é JSON válido — trata como URL única */
      }
    }
    return [s]
  }
  return []
}

/**
 * Saída gerada pela API de remoção de fundo (path contém sem-fundo-<uuid>.jpg).
 * Essas URLs NÃO devem entrar na fila — senão a IA reprocessa o próprio resultado em loop.
 */
export function isUrlAlreadyProcessedByFundoPipeline(url: string): boolean {
  const s = url.toLowerCase()
  return s.includes("sem-fundo-") || s.includes("defeito-") || s.includes("/defeito-")
}

export function normalizeProdutoImagens(row: {
  imagem_url?: string | null
  imagem_urls?: unknown
}): { imagem_url: string | null; imagem_urls: string[] } {
  const imagem_urls = parseImagemUrls(row.imagem_urls)
  const imagem_url =
    row.imagem_url != null && typeof row.imagem_url === "string" && row.imagem_url.trim().length > 0
      ? row.imagem_url.trim()
      : null
  return { imagem_url, imagem_urls }
}

/** URLs únicas ainda pendentes de processamento (originais), dedupe por path. */
export function uniqueImageUrlsForQueue(row: {
  imagem_url?: string | null
  imagem_urls?: unknown
}): string[] {
  const { imagem_url, imagem_urls } = normalizeProdutoImagens(row)
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of [...imagem_urls, imagem_url].filter(Boolean) as string[]) {
    if (isUrlAlreadyProcessedByFundoPipeline(u)) continue
    const key = normalizeUrlForMatch(u)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(u)
    }
  }
  return out
}
