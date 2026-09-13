/**
 * URLs de imagem do catálogo master (`pecas_catalogo`): capa + galeria, sem duplicar.
 */
import { rewriteLegacyMinioUrl } from './storageProdutosUrl'

export type PecaCatalogoImagemFields = {
    imagem_url?: string | null
    imagem_urls?: unknown
}

export function sanitizePecaImageUrl(raw: string): string {
    let s = rewriteLegacyMinioUrl(String(raw ?? '').trim())
    if (!s) return ''
    try {
        if (s.includes('%')) s = decodeURIComponent(s)
    } catch {
        /* ignore */
    }
    if (!/^https?:\/\//i.test(s)) return ''
    try {
        const u = new URL(s)
        u.hash = ''
        // Se for URL do nosso Storage, remove query para evitar duplicatas (?width=... etc.)
        if (u.pathname.includes('/storage/v1/object/public/produtos/')) {
            u.search = ''
        }
        return u.toString()
    } catch {
        return s
    }
}

/** Aceita array, JSON string ou URL única (alguns fluxos gravam JSON em texto). */
export function parseImagemUrlsField(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => sanitizePecaImageUrl(x))
            .filter(Boolean)
    }
    if (typeof raw === 'string') {
        const t = raw.trim()
        if (!t) return []
        if (t.startsWith('[') || t.startsWith('{')) {
            try {
                const p = JSON.parse(t)
                if (Array.isArray(p)) {
                    return p
                        .filter((x): x is string => typeof x === 'string')
                        .map((x) => sanitizePecaImageUrl(x))
                        .filter(Boolean)
                }
            } catch {
                /* fallthrough */
            }
        }
        const one = sanitizePecaImageUrl(t)
        return one ? [one] : []
    }
    return []
}

/** Todas as URLs candidatas (capa + galeria), sem duplicar. */
export function collectPecaCatalogImageCandidates(peca: PecaCatalogoImagemFields): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    const push = (u: string) => {
        const x = sanitizePecaImageUrl(u)
        if (!x || seen.has(x)) return
        seen.add(x)
        out.push(x)
    }
    if (peca.imagem_url) push(String(peca.imagem_url))
    for (const u of parseImagemUrlsField(peca.imagem_urls)) push(u)
    return out
}

export function firstPecaCatalogImageUrl(peca: PecaCatalogoImagemFields): string | null {
    const c = collectPecaCatalogImageCandidates(peca)
    return c[0] ?? null
}

/**
 * Define qual URL aparece primeiro no catálogo (`imagem_url` + ordem em `imagem_urls`).
 * `capaIndex` é o índice na lista `urls` atual (mesma ordem exibida na galeria).
 */
export function applyPecaCatalogCapaOrder(
    urls: string[],
    capaIndex: number
): { imagem_url: string; imagem_urls: string[] } {
    const clean = urls.map((u) => sanitizePecaImageUrl(u)).filter(Boolean)
    if (clean.length === 0) return { imagem_url: '', imagem_urls: [] }
    const i = Math.max(0, Math.min(capaIndex, clean.length - 1))
    const capa = clean[i]!
    const rest = clean.filter((_, j) => j !== i)
    return {
        imagem_url: capa,
        imagem_urls: [capa, ...rest],
    }
}
