import { normalizeProdutoImagens } from "@/lib/imagemUrls"
import { objectPathFromProdutosStoragePublicUrl } from "@/lib/storageProdutosUrl"
import { getApiBaseUrl } from "@/lib/apiBase"
import { deleteProdutoPainelImagesMinio } from "@/lib/uploadProdutoPainel"
import { adminApi } from "@/lib/api"

const BUCKET = "produtos"
const MAX_BYTES = 10 * 1024 * 1024

export type MirrorImportStats = {
  attempted: number
  failed: number
  skippedOwn: number
}

/** URLs públicas legadas Supabase Storage (path contém /object/public/produtos/). */
function isLegacySupabaseProdutosPublicUrl(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.pathname.includes(`/object/public/${BUCKET}/`)
  } catch {
    return false
  }
}

function isMinioProdutosPublicUrl(url: string): boolean {
  const raw = import.meta.env.VITE_MINIO_PUBLIC_URL?.trim().replace(/\/$/, "")
  if (!raw) return false
  try {
    const u = new URL(url.trim())
    const bases = raw.split(",").map((s) => s.trim()).filter(Boolean)
    for (const b of bases) {
      const baseUrl = new URL(b.includes("://") ? b : `https://${b}`)
      if (u.origin !== baseUrl.origin) continue
      const bp = baseUrl.pathname.replace(/\/$/, "") || ""
      if (!bp) {
        if (u.pathname.length > 1) return true
        continue
      }
      if (u.pathname === bp || u.pathname.startsWith(`${bp}/`)) return true
    }
    return false
  } catch {
    return false
  }
}

export function isUrlAlreadyOnOurStorage(url: string): boolean {
  return isLegacySupabaseProdutosPublicUrl(url) || isMinioProdutosPublicUrl(url)
}

/** Caminho do objeto dentro do bucket `produtos` a partir da URL pública. */
export function produtosStorageObjectPathFromPublicUrl(url: string): string | null {
  return objectPathFromProdutosStoragePublicUrl(url)
}

export type RemoveProdutoImagensOpts = {
  excludeProdutoIds?: string[]
}

type PathsReferencedOpts = {
  excludeProdutoIds?: Set<string>
  excludePecaCatalogoIds?: Set<string>
}

export type ProdutoBucketReferencias = {
  sucatas: { fotos?: unknown }[]
  sucatas_pecas: { fotos?: unknown }[]
  produtos: { id: string; imagem_url?: string | null; imagem_urls?: unknown }[]
  pecas_catalogo: { id: string; imagem_url?: string | null; imagem_urls?: unknown }[]
}

async function loadProdutoBucketReferencias(): Promise<ProdutoBucketReferencias> {
  const data = await adminApi.produtoBucketReferencias()
  return {
    sucatas: Array.isArray(data?.sucatas) ? data.sucatas : [],
    sucatas_pecas: Array.isArray(data?.sucatas_pecas) ? data.sucatas_pecas : [],
    produtos: Array.isArray(data?.produtos) ? data.produtos : [],
    pecas_catalogo: Array.isArray(data?.pecas_catalogo) ? data.pecas_catalogo : [],
  }
}

/** Caminhos em `candidatePaths` que ainda aparecem em sucatas, sucatas_pecas, produtos e/ou catálogo. */
async function pathsStillReferencedInDatabase(
  ref: ProdutoBucketReferencias,
  candidatePaths: Set<string>,
  opts?: PathsReferencedOpts
): Promise<Set<string>> {
  const stillUsed = new Set<string>()
  if (candidatePaths.size === 0) return stillUsed

  const excludeProdutoIds = opts?.excludeProdutoIds ?? new Set<string>()
  const excludePecaCatalogoIds = opts?.excludePecaCatalogoIds ?? new Set<string>()

  const considerUrl = (u: string | null | undefined) => {
    if (!u || !isUrlAlreadyOnOurStorage(u)) return
    const p = produtosStorageObjectPathFromPublicUrl(u)
    if (p && candidatePaths.has(p)) stillUsed.add(p)
  }
  const considerArr = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const x of arr) {
      if (typeof x === "string") considerUrl(x)
    }
  }

  for (const r of ref.sucatas) considerArr((r as { fotos?: unknown }).fotos)
  for (const r of ref.sucatas_pecas) considerArr((r as { fotos?: unknown }).fotos)

  for (const r of ref.produtos) {
    if (excludeProdutoIds.has(r.id as string)) continue
    const { imagem_url, imagem_urls } = normalizeProdutoImagens(r as { imagem_url?: string | null; imagem_urls?: unknown })
    considerUrl(imagem_url)
    for (const u of imagem_urls) considerUrl(u)
  }

  for (const r of ref.pecas_catalogo) {
    if (excludePecaCatalogoIds.has(r.id as string)) continue
    const { imagem_url, imagem_urls } = normalizeProdutoImagens(r as { imagem_url?: string | null; imagem_urls?: unknown })
    considerUrl(imagem_url)
    for (const u of imagem_urls) considerUrl(u)
  }

  return stillUsed
}

/**
 * Remove do Storage MinIO os arquivos deste produto que estão no nosso bucket.
 * URLs legadas Supabase não são apagadas pelo cliente (sem cliente Storage).
 */
export async function removeProdutoImagensFromStorage(
  row: { imagem_url?: string | null; imagem_urls?: unknown },
  opts?: RemoveProdutoImagensOpts
): Promise<void> {
  const { imagem_url, imagem_urls } = normalizeProdutoImagens(row)
  const minioPaths = new Set<string>()
  for (const u of [...imagem_urls, imagem_url].filter(Boolean) as string[]) {
    if (!isUrlAlreadyOnOurStorage(u)) continue
    const p = produtosStorageObjectPathFromPublicUrl(u)
    if (!p) continue
    if (isMinioProdutosPublicUrl(u)) minioPaths.add(p)
  }
  if (minioPaths.size === 0) return

  const ref = await loadProdutoBucketReferencias()
  const exclude = new Set(opts?.excludeProdutoIds ?? [])
  const stillUsed = await pathsStillReferencedInDatabase(ref, minioPaths, { excludeProdutoIds: exclude })
  const toRemoveMi = [...minioPaths].filter((p) => !stillUsed.has(p))
  if (toRemoveMi.length > 0) await deleteProdutoPainelImagesMinio(toRemoveMi)
}

/**
 * Após remover URLs de `produtos` ou `pecas_catalogo`, tenta apagar do bucket só os caminhos MinIO
 * que deixaram de ser referenciados.
 */
export async function removeOrphanedProdutosBucketPathsForUrls(urls: string[]): Promise<void> {
  const minioPaths = new Set<string>()
  for (const u of urls) {
    const t = (u || "").trim()
    if (!t || !isUrlAlreadyOnOurStorage(t)) continue
    const p = produtosStorageObjectPathFromPublicUrl(t)
    if (!p) continue
    if (isMinioProdutosPublicUrl(t)) minioPaths.add(p)
  }
  if (minioPaths.size === 0) return

  const ref = await loadProdutoBucketReferencias()
  const stillUsed = await pathsStillReferencedInDatabase(ref, minioPaths, {})
  const toRemoveMi = [...minioPaths].filter((p) => !stillUsed.has(p))
  if (toRemoveMi.length > 0) await deleteProdutoPainelImagesMinio(toRemoveMi)
}

function shouldTryMirror(url: string): boolean {
  const t = url.trim()
  if (!/^https?:\/\//i.test(t)) return false
  if (isUrlAlreadyOnOurStorage(t)) return false
  return true
}

function extFromMime(ct: string | null): string {
  const c = (ct || "").toLowerCase()
  if (c.includes("png")) return "png"
  if (c.includes("webp")) return "webp"
  if (c.includes("gif")) return "gif"
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg"
  return "jpg"
}

function extFromPathname(pathname: string): string {
  const m = pathname.match(/\.([a-z0-9]+)$/i)
  if (!m) return "jpg"
  const e = m[1].toLowerCase()
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(e)) return e === "jpeg" ? "jpg" : e
  return "jpg"
}

async function tryProxyDownload(
  sourceUrl: string,
  accessToken: string,
  proxyBase: string
): Promise<{ blob: Blob; contentType: string } | null> {
  try {
    const res = await fetch(`${proxyBase}/api/import/proxy-image`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url: sourceUrl }),
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.warn(`[mirrorImportImages] Erro ${res.status} no proxy (auth) — ${proxyBase}/api/import/proxy-image`)
      }
      return null
    }
    const len = res.headers.get("content-length")
    if (len && Number(len) > MAX_BYTES) return null
    const blob = await res.blob()
    if (blob.size === 0 || blob.size > MAX_BYTES) return null
    const ct = res.headers.get("content-type") || "image/jpeg"
    return { blob, contentType: ct.split(";")[0].trim() || "image/jpeg" }
  } catch (e) {
    console.warn("[mirrorImportImages] Rede / CORS no proxy:", (e as Error).message?.slice(0, 80))
    return null
  }
}

async function downloadImageForMirror(
  sourceUrl: string,
  accessToken: string | null
): Promise<{ blob: Blob; contentType: string } | null> {
  // Tenta fetch direto primeiro (funciona para URLs com CORS aberto ou do nosso storage)
  try {
    const res = await fetch(sourceUrl, { mode: "cors", credentials: "omit" })
    if (res.ok) {
      const len = res.headers.get("content-length")
      if (len && Number(len) > MAX_BYTES) return null
      const blob = await res.blob()
      if (blob.size > 0 && blob.size <= MAX_BYTES) {
        const ct = res.headers.get("content-type") || blob.type || "image/jpeg"
        return { blob, contentType: ct.split(";")[0].trim() || "image/jpeg" }
      }
    }
  } catch {
    /* proxy */
  }

  if (!accessToken) {
    console.warn("[mirrorImportImages] Sem accessToken — proxy indisponível para:", sourceUrl.slice(0, 80))
    return null
  }

  // Tenta via apiBase (VITE_API_URL)
  const apiBase = getApiBaseUrl()
  let result = await tryProxyDownload(sourceUrl, accessToken, apiBase)
  if (result) return result

  // Fallback: tenta pelo mesmo domínio da página (backend Express pode servir /api no mesmo origin)
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin
    if (origin !== apiBase) {
      console.warn("[mirrorImportImages] Proxy via apiBase falhou, tentando origin:", origin.slice(0, 60))
      result = await tryProxyDownload(sourceUrl, accessToken, origin)
      if (result) return result
    }
  }

  console.warn("[mirrorImportImages] Proxy falhou para:", sourceUrl.slice(0, 80))
  return null
}

async function mirrorOneUrl(
  sourceUrl: string,
  pathPrefix: "import-estoque" | "import-sucata" | "catalog-templates",
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null
): Promise<string> {
  const trimmed = sourceUrl.trim()
  if (!shouldTryMirror(trimmed)) {
    if (/^https?:\/\//i.test(trimmed) && isUrlAlreadyOnOurStorage(trimmed)) stats.skippedOwn++
    return trimmed
  }

  const cached = cache.get(trimmed)
  if (cached !== undefined) return cached

  stats.attempted++
  try {
    const got = await downloadImageForMirror(trimmed, accessToken)
    if (!got) {
      stats.failed++
      cache.set(trimmed, trimmed)
      return trimmed
    }
    const { blob, contentType: ct } = got
    let ext = extFromMime(ct)
    try {
      const pu = new URL(trimmed)
      const pe = extFromPathname(pu.pathname)
      if (ext === "jpg" && pe !== "jpg") ext = pe
    } catch {
      /* ignore */
    }
    const fname = `${pathPrefix}-${Date.now()}-${crypto.randomUUID()}.${ext}`
    const file = new File([blob], fname, { type: ct || "image/jpeg" })
    const fd = new FormData()
    fd.append("file", file)
    const data = await adminApi.uploadProdutoImagem(fd)
    const publicUrl = typeof data?.url === "string" ? data.url.trim() : ""
    if (!publicUrl) {
      console.warn("[mirrorImportImages] upload sem URL")
      stats.failed++
      cache.set(trimmed, trimmed)
      return trimmed
    }
    cache.set(trimmed, publicUrl)
    return publicUrl
  } catch (e) {
    console.warn("[mirrorImportImages] mirror", trimmed.slice(0, 80), e)
    stats.failed++
    cache.set(trimmed, trimmed)
    return trimmed
  }
}

async function mirrorUrlList(
  urls: string[],
  pathPrefix: "import-estoque" | "import-sucata" | "catalog-templates",
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null
): Promise<string[]> {
  const out: string[] = []
  for (const u of urls) {
    if (typeof u !== "string" || !u.trim()) continue
    out.push(await mirrorOneUrl(u, pathPrefix, cache, stats, accessToken))
  }
  return out
}

export async function mirrorEstoqueRowImages(
  row: Record<string, unknown>,
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null
): Promise<Record<string, unknown>> {
  const { imagem_url, imagem_urls } = normalizeProdutoImagens({
    imagem_url: row.imagem_url as string | null | undefined,
    imagem_urls: row.imagem_urls,
  })
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const u of [...imagem_urls, imagem_url].filter(Boolean) as string[]) {
    const t = u.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    ordered.push(t)
  }
  if (ordered.length === 0) return row

  const newUrls = await mirrorUrlList(ordered, "import-estoque", cache, stats, accessToken)
  const next = { ...row, imagem_urls: newUrls, imagem_url: newUrls[0] ?? row.imagem_url }
  return next
}

export async function mirrorSucataRowFotos(
  row: Record<string, unknown>,
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null
): Promise<Record<string, unknown>> {
  const fotos = row.fotos
  if (!Array.isArray(fotos) || fotos.length === 0) return row
  const urls = fotos.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
  if (urls.length === 0) return row
  const newFotos = await mirrorUrlList(urls, "import-sucata", cache, stats, accessToken)
  return { ...row, fotos: newFotos }
}

export function emptyMirrorStats(): MirrorImportStats {
  return { attempted: 0, failed: 0, skippedOwn: 0 }
}

async function mapPool<T, R>(items: T[], poolSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const worker = async () => {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  const workers = Math.min(poolSize, Math.max(1, items.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export async function mirrorEstoquePayload(
  rows: Record<string, unknown>[],
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null,
  concurrency = 4
): Promise<Record<string, unknown>[]> {
  return mapPool(rows, concurrency, (row) => mirrorEstoqueRowImages(row, cache, stats, accessToken))
}

export async function mirrorSucataPayload(
  rows: Record<string, unknown>[],
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null,
  concurrency = 4
): Promise<Record<string, unknown>[]> {
  return mapPool(rows, concurrency, (row) => mirrorSucataRowFotos(row, cache, stats, accessToken))
}

/** Espelha URLs externas do catálogo master (mantém URLs já no Storage). */
export async function mirrorPecaCatalogoImageUrls(
  urls: string[],
  cache: Map<string, string>,
  stats: MirrorImportStats,
  accessToken: string | null
): Promise<string[]> {
  if (!urls.length) return []
  return mirrorUrlList(urls, "catalog-templates", cache, stats, accessToken)
}
