import { estoqueApi, vendasApi, orcamentosApi, clientesApi, indicacoesApi } from '@/lib/api'
import { useProdutosCache } from './produtosCache'

/** Cache simples em memória para pintura instantânea ao revisitar rotas frequentes (TTL curto). */
const pageCache: Record<string, { data: unknown; ts: number }> = {}

export const CACHE_TTL_PAGE_PREFETCH = 30_000

export function getCachedPage(key: string) {
    const c = pageCache[key]
    if (!c || Date.now() - c.ts > CACHE_TTL_PAGE_PREFETCH) return null
    return c.data
}

export function setCachedPage(key: string, data: unknown) {
    pageCache[key] = { data, ts: Date.now() }
}

export function invalidateCachedPage(key: string) {
    delete pageCache[key]
}

/** Prefetch escalonado após login — não compete com o primeiro paint. */
export function startPrefetch() {
    setTimeout(async () => {
        try {
            const res = await estoqueApi.listarProdutos({
                painel: true,
                limit: 12,
                offset: 0,
                ordenar: 'created_at',
                direcao: 'desc',
            })
            setCachedPage('produtos', res)
            const items = Array.isArray(res) ? res : (res as { items?: unknown[] })?.items ?? []
            const total =
                typeof (res as { total?: number })?.total === 'number'
                    ? (res as { total: number }).total
                    : items.length
            useProdutosCache.setState({ items: items as never[], total, lastFetched: Date.now(), loading: false })
        } catch {
            /* prefetch opcional */
        }
    }, 1000)

    setTimeout(async () => {
        try {
            const res = await clientesApi.listarCrm({
                limit: 30,
                offset: 0,
                sort_by: 'nome',
                sort_dir: 'asc',
            })
            setCachedPage('clientes', res)
        } catch {
            /* prefetch opcional */
        }
    }, 2000)

    setTimeout(async () => {
        try {
            const res = await vendasApi.listar({ limit: 50, offset: 0 })
            setCachedPage('vendas', res)
        } catch {
            /* prefetch opcional */
        }
    }, 3000)

    setTimeout(async () => {
        try {
            const res = await orcamentosApi.listar({ limit: 1000, offset: 0 })
            setCachedPage('orcamentos', res)
        } catch {
            /* prefetch opcional */
        }
    }, 5000)

    setTimeout(async () => {
        try {
            const res = await indicacoesApi.listar({ limit: 500 })
            setCachedPage('indicacoes', res)
        } catch {
            /* prefetch opcional */
        }
    }, 7000)
}
