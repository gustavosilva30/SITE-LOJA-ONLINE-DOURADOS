/**
 * api.ts — Utilitário centralizado para o backend próprio
 *
 * API_BASE é resolvido dinamicamente via getApiBaseUrl().
 * Todas as rotas exigem JWT via Authorization header.
 *
 * Uso:
 *   import { api } from '@/lib/api'
 *   const clientes = await api.get('/api/clientes/')
 *   const novo = await api.post('/api/clientes/', { nome: 'João' })
 *   const atualizado = await api.put('/api/clientes/uuid', { telefone: '...' })
 *   const boletos = await boletosApi.listarClientesPendentes()
 */

import { getApiBaseUrl, ensureHttps } from './apiBase'
import { getAuthToken, setAuthToken, getRefreshToken, setRefreshToken, clearAuthToken } from './auth'
import { isAutopecasPublicSiteHost } from './publicSiteHost'

/** URL absoluta da API; força https em produção mesmo se VITE_API_URL no build vier como http:// */
function apiAbsoluteUrl(path: string): string {
    return ensureHttps(`${getApiBaseUrl()}${path}`)
}

const getToken = (): string | null => getAuthToken()

const authHeader = (): Record<string, string> => {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

// ─── Refresh token: troca refresh por novo access em 401 ───────────────────
// Promise compartilhada: se várias requisições derem 401 ao mesmo tempo,
// só uma chamada de /auth/refresh é feita; as outras esperam o resultado.
let _refreshInFlight: Promise<boolean> | null = null

async function _doRefresh(): Promise<boolean> {
    const refresh = getRefreshToken()
    if (!refresh) return false
    try {
        const res = await fetch(apiAbsoluteUrl('/api/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refresh }),
        })
        if (!res.ok) return false
        const data = await res.json()
        if (!data?.access_token) return false
        setAuthToken(data.access_token)
        if (data.refresh_token) setRefreshToken(data.refresh_token)
        if (data.user) {
            try { localStorage.setItem('user', JSON.stringify(data.user)) } catch { /* ignore */ }
        }
        return true
    } catch {
        return false
    }
}

function tryRefresh(): Promise<boolean> {
    if (!_refreshInFlight) {
        _refreshInFlight = _doRefresh().finally(() => { _refreshInFlight = null })
    }
    return _refreshInFlight
}

/**
 * Verifica o status HTTP e lança erro com a mensagem do backend se disponível.
 * Retorna o JSON parseado.
 */
function clearSessionAndRedirectToLogin() {
    if (typeof window === 'undefined') return
    
    // Se estivermos no domínio da vitrine pública, não redirecionamos para login do CRM.
    // Isso evita que falhas em endpoints (ex. 401 por token expirado ou rotas privadas chamadas na landing)
    // levem o cliente da vitrine para o painel administrativo.
    if (isAutopecasPublicSiteHost(window.location.hostname)) {
        return
    }
    
    // Se não houver token, já estamos deslogados, não precisa fazer nada
    if (!getToken()) {
        if (!window.location.pathname.includes('/login')) {
            window.location.assign('/login')
        }
        return
    }

    // Limpa o token
    clearAuthToken()
    
    const path = window.location.pathname || ''
    if (!path.includes('/login')) {
        // Usa replace em vez de assign para não sujar o histórico
        window.location.replace('/login')
    }
}

async function handleResponse(res: Response): Promise<any> {
    if (!res.ok) {
        if (res.status === 401) {
            // O retry com refresh é tratado em fetchWithRetry. Quando chegamos aqui
            // com 401, ou não tinha refresh ou o refresh também falhou — limpa sessão.
            clearSessionAndRedirectToLogin()
        }

        const urlObj = new URL(res.url)
        const path = urlObj.pathname
        let message = `Erro ${res.status} em ${path}`
        
        try {
            const body = await res.json()
            const detail = body?.detail
            if (Array.isArray(detail)) {
                message = detail
                    .map((d: any) => {
                        const loc = Array.isArray(d?.loc) ? d.loc.join(".") : ""
                        const msg = d?.msg || JSON.stringify(d)
                        return loc ? `${loc}: ${msg}` : msg
                    })
                    .join(" | ")
            } else if (detail && typeof detail === "object") {
                message = JSON.stringify(detail)
            } else {
                message = detail || body?.error || body?.message || message
            }
        } catch {
            // Corpo não é JSON — usa o statusText
            message = res.statusText ? `${res.statusText} (${res.status})` : message
        }

        // Se for 403, adicionamos uma dica
        if (res.status === 403) {
            message = `Acesso Negado: ${message}. Verifique suas permissões ou se o seu IP foi bloqueado temporariamente.`
        }

        throw new Error(message)
    }
    // 204 No Content — retorna null
    if (res.status === 204) return null
    return res.json()
}

/**
 * Wrapper de fetch que:
 *   1. Anexa Authorization Bearer atual.
 *   2. Em caso de 401, tenta refresh do access token (uma única vez por chamada).
 *   3. Refaz a request original com o novo token.
 * Se não tiver refresh ou o refresh falhar, deixa o handleResponse cuidar (limpa sessão e redireciona).
 *
 * `init` NÃO deve incluir Authorization (é injetado aqui).
 * Se houver `body` e for string/FormData, é repassado como está.
 */
function appendQueryParams(path: string, params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) return path

    const [basePath, existingQuery = ''] = path.split('?')
    const searchParams = new URLSearchParams(existingQuery)

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return
        searchParams.set(key, String(value))
    })

    const queryString = searchParams.toString()
    return queryString ? `${basePath}?${queryString}` : basePath
}

async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
    const url = apiAbsoluteUrl(path)
    const baseHeaders: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
        ...authHeader(),
    }
    let res = await fetch(url, { ...init, headers: baseHeaders })
    if (res.status !== 401) return res
    // 401 — tentar refresh (uma vez)
    const ok = await tryRefresh()
    if (!ok) return res
    const retryHeaders: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
        ...authHeader(),
    }
    res = await fetch(url, { ...init, headers: retryHeaders })
    return res
}

export const api = {
    /** GET /path — retorna JSON */
    get: (path: string, options?: { params?: Record<string, unknown> }): Promise<any> =>
        fetchWithAuth(appendQueryParams(path, options?.params)).then(handleResponse),

    /** POST /path com body JSON — retorna JSON */
    post: (path: string, body: unknown, options?: { params?: Record<string, unknown> }): Promise<any> =>
        fetchWithAuth(appendQueryParams(path, options?.params), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(handleResponse),

    /** POST multipart (FormData) — sem Content-Type fixo (boundary automático). */
    postMultipart: (path: string, formData: FormData): Promise<any> =>
        fetchWithAuth(path, {
            method: 'POST',
            body: formData,
        }).then(handleResponse),

    /** POST multipart (FormData) — mesmo contrato que postMultipart. */
    postForm: async (path: string, formData: FormData): Promise<any> => {
        const res = await fetchWithAuth(path, {
            method: 'POST',
            body: formData,
        })
        return handleResponse(res)
    },

    /** PUT /path com body JSON — retorna JSON */
    put: (path: string, body: unknown, options?: { params?: Record<string, unknown> }): Promise<any> =>
        fetchWithAuth(appendQueryParams(path, options?.params), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(handleResponse),

    /** PATCH /path com body JSON — retorna JSON */
    patch: (path: string, body: unknown, options?: { params?: Record<string, unknown> }): Promise<any> =>
        fetchWithAuth(appendQueryParams(path, options?.params), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(handleResponse),

    /** DELETE /path — retorna JSON ou null */
    delete: (path: string, options?: RequestInit & { params?: Record<string, unknown> }): Promise<any> =>
        fetchWithAuth(appendQueryParams(path, options?.params), { method: 'DELETE', ...options }).then(handleResponse),
}

// ─── Helpers de domínio ─────────────────────────────────────────────────────
// Funções com semântica de negócio para facilitar o uso e isolar URLs.

export const clientesApi = {
    criar: (dados: Record<string, unknown>) =>
        api.post('/api/clientes/', dados),

    atualizar: (id: string, dados: Record<string, unknown>) =>
        api.put(`/api/clientes/${id}`, dados),

    deletar: (id: string) =>
        api.delete(`/api/clientes/${id}`),

    detalhe: (id: string) =>
        api.get(`/api/clientes/${id}`),

    listar: (params?: { q?: string; ativo?: boolean; limit?: number; offset?: number }) => {
        const qs = new URLSearchParams()
        if (params?.q) qs.set('q', params.q)
        if (params?.ativo !== undefined) qs.set('ativo', String(params.ativo))
        if (params?.limit !== undefined) qs.set('limit', String(params.limit))
        if (params?.offset !== undefined) qs.set('offset', String(params.offset))
        const query = qs.toString()
        return api.get(`/api/clientes/${query ? `?${query}` : ''}`)
    },

    /** Listagem paginada do CRM (filtros iguais à tela Clientes). */
    listarCrm: (params: Record<string, string | number | undefined>) => {
        const qs = new URLSearchParams()
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === '') continue
            qs.set(k, String(v))
        }
        return api.get(`/api/clientes/crm?${qs}`)
    },

    crmEstatisticas: () => api.get('/api/clientes/crm/estatisticas'),

    haverHistorico: (id: string, limit?: number) => {
        const q = limit != null ? `?limit=${limit}` : ''
        return api.get(`/api/clientes/${id}/haver-historico${q}`)
    },

    haverMovimento: (
        id: string,
        body: { valor: number; tipo: string; observacao?: string | null },
    ) => api.post(`/api/clientes/${id}/haver`, body),
}

export const pedidosClientesApi = {
    listar: (params?: {
        status?: string
        status_in?: string
        atendente_id?: string
        cliente_id?: string
        chat_id?: string
        urgencia?: string
        vencendo_ate?: string
        q?: string
        limit?: number
        offset?: number
    }) => {
        const qs = new URLSearchParams()
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v === undefined || v === null || v === '') continue
                qs.set(k, String(v))
            }
        }
        const q = qs.toString()
        return api.get(`/api/pedidos-clientes/${q ? `?${q}` : ''}`)
    },

    contadores: () => api.get('/api/pedidos-clientes/contadores'),

    detalhe: (id: string) => api.get(`/api/pedidos-clientes/${id}`),

    criar: (dados: Record<string, unknown>) =>
        api.post('/api/pedidos-clientes/', dados),

    atualizar: (id: string, dados: Record<string, unknown>) =>
        api.put(`/api/pedidos-clientes/${id}`, dados),

    alterarStatus: (id: string, status: string) =>
        api.patch(`/api/pedidos-clientes/${id}/status`, { status }),

    deletar: (id: string) =>
        api.delete(`/api/pedidos-clientes/${id}`),
}

export const vendasApi = {
    listar: (params?: { status?: string; status_in?: string; cliente_id?: string; origem_ml?: boolean; q?: string; numero_pedido?: number; data_inicio?: string; data_fim?: string; limit?: number; offset?: number }) => {
        const qs = new URLSearchParams()
        if (params?.status) qs.set('status', params.status)
        if (params?.status_in) qs.set('status_in', params.status_in)
        if (params?.cliente_id) qs.set('cliente_id', params.cliente_id)
        if (params?.origem_ml !== undefined) qs.set('origem_ml', String(params.origem_ml))
        if (params?.q) qs.set('q', params.q)
        if (params?.numero_pedido !== undefined) qs.set('numero_pedido', String(params.numero_pedido))
        if (params?.data_inicio) qs.set('data_inicio', params.data_inicio)
        if (params?.data_fim) qs.set('data_fim', params.data_fim)
        if (params?.limit !== undefined) qs.set('limit', String(params.limit))
        if (params?.offset !== undefined) qs.set('offset', String(params.offset))
        const query = qs.toString()
        return api.get(`/api/vendas/${query ? `?${query}` : ''}`)
    },

    criar: (dados: any) =>
        api.post('/api/vendas/', dados),

    detalhe: (id: string) =>
        api.get(`/api/vendas/${id}`),

    detalheCompleto: (id: string) =>
        api.get(`/api/vendas/${id}/completo`),

    finalizar: (id: string, parcelas: any[], saldo_haver_cliente_update?: number) =>
        api.put(`/api/vendas/${id}/finalizar`, { parcelas, saldo_haver_cliente_update }),

    cancelar: (id: string) =>
        api.put(`/api/vendas/${id}/cancelar`, {}),

    quitar: (id: string, dados: {
        status?: string
        historico_entry?: Record<string, unknown>
        pix_nome_pagador?: string | null
        gerar_fatura?: boolean
        parcelas?: any[]
    }) => api.put(`/api/vendas/${id}/quitar`, dados),

    deletar: (id: string) =>
        api.delete(`/api/vendas/${id}`),

    atualizarObservacao: (id: string, observacao: string | null) =>
        api.patch(`/api/vendas/${id}/observacao`, { observacao }),

    devolucoesItens: (id: string) =>
        api.get(`/api/vendas/${id}/devolucoes-itens`),

    editar: (id: string, dados: Record<string, unknown>) =>
        api.put(`/api/vendas/${id}/editar`, dados),

    finalizarCompleto: (id: string, dados: Record<string, unknown>) =>
        api.put(`/api/vendas/${id}/finalizar-completo`, dados),

    edicaoAvancada: (id: string, dados: Record<string, unknown>) =>
        api.put(`/api/vendas/${id}/edicao-avancada`, dados),

    itensPorVendas: (vendaIds: string[]) => {
        if (!vendaIds.length) return Promise.resolve([])
        const qs = new URLSearchParams()
        qs.set('venda_ids', vendaIds.join(','))
        return api.get(`/api/vendas/itens-por-vendas?${qs.toString()}`)
    },
}

export const financeiroApi = {
    listar: (params?: Record<string, string | number | boolean>) => {
        const qs = new URLSearchParams()
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined) qs.set(k, String(v))
            }
        }
        const query = qs.toString()
        return api.get(`/api/financeiro/lancamentos/${query ? `?${query}` : ''}`)
    },

    criar: (dados: any) =>
        api.post('/api/financeiro/lancamentos', dados),

    atualizar: (id: string, dados: any) =>
        api.put(`/api/financeiro/lancamentos/${id}`, dados),

    deletar: (id: string) =>
        api.delete(`/api/financeiro/lancamentos/${id}`),

    resumo: (params?: Record<string, string>) => {
        const query = params ? new URLSearchParams(params).toString() : ''
        return api.get(`/api/financeiro/resumo${query ? '?' + query : ''}`)
    },
}

export const caixaApi = {
    listarRegistros: (params?: { limit?: number; offset?: number }) => {
        const qs = new URLSearchParams()
        if (params?.limit != null) qs.set('limit', String(params.limit))
        if (params?.offset != null) qs.set('offset', String(params.offset))
        const q = qs.toString()
        return api.get(`/api/caixa/registros/${q ? `?${q}` : ''}`)
    },

    registroPorData: (data: string) => api.get(`/api/caixa/registros/${data}`),

    abrir: (body: { data_registro?: string; valor_abertura: number; observacoes?: string | null }) =>
        api.post('/api/caixa/registros/abrir', body),

    fechar: (registroId: string, body: { valor_fechamento: number; observacoes?: string | null }) =>
        api.put(`/api/caixa/registros/${registroId}/fechar`, body),

    /** Somente dinheiro — totais de caixa físico */
    movimentacoesDia: (data: string) => api.get(`/api/caixa/movimentacoes/${data}`),

    /** Todos os lançamentos pagos no dia (painel) + totais em dinheiro */
    lancamentosPagosDia: (data: string) => api.get(`/api/caixa/dia/${data}/lancamentos-pagos`),

    criarMovimento: (body: { tipo_movimento: 'Suprimento' | 'Sangria'; valor: number; descricao?: string }) =>
        api.post('/api/caixa/movimentos', body),

    relatorioFechamento: (data: string) => api.get(`/api/caixa/relatorio-fechamento/${data}`),
}

export const dashboardApi = {
    pack: (params: {
        start: string
        end: string
        prev_start?: string
        prev_end?: string
        spark_days?: number
    }) => {
        const qs = new URLSearchParams()
        qs.set('start', params.start)
        qs.set('end', params.end)
        if (params.prev_start) qs.set('prev_start', params.prev_start)
        if (params.prev_end) qs.set('prev_end', params.prev_end)
        if (params.spark_days != null) qs.set('spark_days', String(params.spark_days))
        return api.get(`/api/dashboard/pack?${qs.toString()}`)
    },

    clientesInativos: () => api.get('/api/dashboard/clientes-inativos'),

    /** Contagens do menu lateral (substitui queries Supabase + RPC). */
    sidebarCounts: () =>
        api.get('/api/dashboard/sidebar-counts') as Promise<{
            lembretes: number
            entregas: number
            carrinho: number
            recados: number
            uso_interno: number
        }>,

    /** Prévia de alertas (estoque, vendas, pedidos loja) — substitui queries Supabase no painel. */
    notificationsPreview: () =>
        api.get('/api/dashboard/notifications-preview') as Promise<{
            low_stock_count: number
            recent_sales: { id: string; total: number; origem_ml: boolean; data_venda: string | null }[]
            recent_store_orders: { id: string; total: number; order_number: string; created_at: string | null }[]
        }>,
}

export const recadosApi = {
    naoLidos: () => api.get('/api/recados/internos/unread'),
    marcarLido: (recadoId: string) => api.patch(`/api/recados/internos/${recadoId}/lido`, {}),
    enviar: (body: { destinatario_id: string; mensagem: string; urgente?: boolean }) =>
        api.post('/api/recados/internos', body),
    recebidos: () => api.get('/api/recados/internos/recebidos'),
    enviados: () => api.get('/api/recados/internos/enviados'),
    deletar: (recadoId: string) => api.delete(`/api/recados/internos/${recadoId}`),
}

export const estoqueApi = {
    listarCategorias: () =>
        api.get('/api/estoque/categorias/'),

       listarProdutos: (params?: {
        ativo?: boolean
        categoria_id?: string
        q?: string
        sku?: string
        part_number?: string
        marca?: string
        preco_min?: number
        preco_max?: number
        custo_min?: number
        custo_max?: number
        localizacao_id?: string
        /** UUIDs separados por vírgula (filtro IN no painel). */
        localizacao_ids?: string
        localizacao_q?: string
        /** painel: sim | nao — publicado na loja ou com meli_id */
        anunciados?: string
        meli?: string
        loja?: string
        estoque?: string
        preco?: string
        sucata?: string
        sucata_id?: string
        ordem?: string
        ordenar?: string
        direcao?: string
        painel?: boolean
        /** painel: UUIDs de produtos separados por vírgula */
        produto_ids?: string
        /** painel: true | false | pendente */
        fundo_removido?: string
        created_after?: string
        created_before?: string
        limit?: number
        offset?: number
    }) => {
        const qs = new URLSearchParams()
        if (params?.ativo !== undefined) qs.set('ativo', String(params.ativo))
        if (params?.categoria_id) qs.set('categoria_id', params.categoria_id)
        if (params?.q) qs.set('q', params.q)
        if (params?.sku) qs.set('sku', params.sku)
        if (params?.part_number) qs.set('part_number', params.part_number)
        if (params?.marca) qs.set('marca', params.marca)
        if (params?.preco_min !== undefined) qs.set('preco_min', String(params.preco_min))
        if (params?.preco_max !== undefined) qs.set('preco_max', String(params.preco_max))
        if (params?.custo_min !== undefined) qs.set('custo_min', String(params.custo_min))
        if (params?.custo_max !== undefined) qs.set('custo_max', String(params.custo_max))
        if (params?.localizacao_id) qs.set('localizacao_id', params.localizacao_id)
        if (params?.localizacao_ids) qs.set('localizacao_ids', params.localizacao_ids)
        if (params?.localizacao_q) qs.set('localizacao_q', params.localizacao_q)
        if (params?.anunciados) qs.set('anunciados', params.anunciados)
        if (params?.meli) qs.set('meli', params.meli)
        if (params?.loja) qs.set('loja', params.loja)
        if (params?.estoque) qs.set('estoque', params.estoque)
        if (params?.preco) qs.set('preco', params.preco)
        if (params?.sucata) qs.set('sucata', params.sucata)
        if (params?.sucata_id) qs.set('sucata_id', params.sucata_id)
        if (params?.ordem) qs.set('ordem', params.ordem)
        if (params?.ordenar) qs.set('ordenar', params.ordenar)
        if (params?.direcao) qs.set('direcao', params.direcao)
        if (params?.painel) qs.set('painel', 'true')
        if (params?.produto_ids) qs.set('produto_ids', params.produto_ids)
        if (params?.fundo_removido) qs.set('fundo_removido', params.fundo_removido)
        if (params?.created_after) qs.set('created_after', params.created_after)
        if (params?.created_before) qs.set('created_before', params.created_before)
        if (params?.limit !== undefined) qs.set('limit', String(params.limit))
        if (params?.offset !== undefined) qs.set('offset', String(params.offset))
        const query = qs.toString()
        return api.get(`/api/estoque/produtos/${query ? `?${query}` : ''}`)
    },

    detalheProduto: (id: string) => api.get(`/api/estoque/produtos/${id}`),

    criarProduto: (dados: Record<string, unknown>) =>
        api.post('/api/estoque/produtos', dados),

    atualizarProduto: (id: string, dados: Record<string, unknown>) =>
        api.put(`/api/estoque/produtos/${id}`, dados),

    deletarProduto: (id: string) => api.delete(`/api/estoque/produtos/${id}`),

    /** Ativa/inativa o produto. Inativar dá baixa no saldo no servidor —
     *  por isso não se usa atualizarProduto({ ativo: false }) para isso. */
    alternarAtivacaoProduto: (id: string, ativo: boolean) =>
        api.post(`/api/estoque/produtos/${id}/ativacao`, { ativo }),

    excluirProdutosMassa: (ids: string[]) =>
        api.post('/api/estoque/produtos/excluir-em-massa', { ids }),

    marcarEtiquetasImpressas: (produto_ids: string[]) =>
        api.post('/api/estoque/produtos/marcar-etiquetas-impressas', { produto_ids }),

    /** Compatibilidades de veículo (PostgreSQL VPS — não usar Supabase). */
    listarCompatibilidadeProduto: (produtoId: string) =>
        api.get(`/api/estoque/produtos/${produtoId}/compatibilidade`),

    substituirCompatibilidadeProduto: (
        produtoId: string,
        items: Array<{
            marca?: string | null
            modelo?: string | null
            ano?: string | number | null
            versao?: string | null
            motorizacao?: string | null
            familia?: string | null
            posicoes?: string[] | null
            /** Veículo do catálogo do ML; quando presente, a publicação usa esse id direto. */
            ml_product_id?: string | null
        }>,
    ) => api.put(`/api/estoque/produtos/${produtoId}/compatibilidade`, { items }),

    registrarMovimentacao: (dados: {
        produto_id: string
        tipo: 'entrada' | 'saida' | 'ajuste'
        quantidade: number
        motivo?: string
        referencia_id?: string
    }) => api.post('/api/estoque/movimentacoes', dados),

    nextSku: () => api.get('/api/estoque/next-sku'),

    buscarProdutos: (params: { q?: string; sku?: string; exact_code?: string; limit?: number; estoque?: string }) => {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', params.q)
        if (params.sku) qs.set('sku', params.sku)
        if (params.exact_code) qs.set('exact_code', params.exact_code)
        if (params.limit !== undefined) qs.set('limit', String(params.limit))
        if (params.estoque) qs.set('estoque', params.estoque)
        return api.get(`/api/estoque/produtos/busca?${qs}`)
    },

    notificarSeparacao: (id: string, payload: { notificar_atendente1: boolean; notificar_atendente2: boolean }) =>
        api.post(`/api/estoque/produtos/${id}/notificar-separacao`, payload),
}

/** Relatórios do CRM — dados via PostgreSQL (DATABASE_URL / VPS), sem Supabase. */
export const relatoriosApi = {
    executar: (params: {
        tipo: string
        data_inicio?: string
        data_fim?: string
        cliente_id?: string
        status?: string
    }) => {
        const qs = new URLSearchParams()
        qs.set('tipo', params.tipo)
        if (params.data_inicio) qs.set('data_inicio', params.data_inicio)
        if (params.data_fim) qs.set('data_fim', params.data_fim)
        if (params.cliente_id) qs.set('cliente_id', params.cliente_id)
        if (params.status) qs.set('status', params.status)
        return api.get(`/api/relatorios/executar?${qs}`)
    },
}

export const produtoSearchesApi = {
  registrar: (termo: string, total_resultados: number) =>
    api.post('/api/produto-searches', { termo, total_resultados }),
  top: (params: {
    data_inicio?: string
    data_fim?: string
    atendente_ids?: string[]
    somente_zero_resultados?: boolean
    min_buscas?: number
    limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params.data_inicio) qs.set('data_inicio', params.data_inicio)
    if (params.data_fim) qs.set('data_fim', params.data_fim)
    if (params.atendente_ids?.length) qs.set('atendente_ids', params.atendente_ids.join(','))
    if (params.somente_zero_resultados) qs.set('somente_zero_resultados', 'true')
    if (params.min_buscas !== undefined) qs.set('min_buscas', String(params.min_buscas))
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    return api.get(`/api/produto-searches/top?${qs}`)
  },
}

export const atendentesApi = {
  listar: (params?: { q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/atendentes/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/atendentes/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/atendentes/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/atendentes/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/atendentes/${id}`),
}

export const orcamentosApi = {
  listar: (params?: { status?: string; cliente_id?: string; vendedor_id?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.cliente_id) qs.set('cliente_id', params.cliente_id)
    if (params?.vendedor_id) qs.set('vendedor_id', params.vendedor_id)
    if (params?.q) qs.set('q', params.q)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/orcamentos/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/orcamentos/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/orcamentos/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/orcamentos/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/orcamentos/${id}`),
  adicionarItem: (id: string, item: Record<string, unknown>) => api.post(`/api/orcamentos/${id}/itens`, item),
  atualizarItem: (id: string, itemId: string, item: Record<string, unknown>) => api.put(`/api/orcamentos/${id}/itens/${itemId}`, item),
  removerItem: (id: string, itemId: string) => api.delete(`/api/orcamentos/${id}/itens/${itemId}`),
  aprovar: (id: string) => api.put(`/api/orcamentos/${id}/aprovar`, {}),
  buscarPorProduto: (q: string, produto_id?: string) => {
    const qs = new URLSearchParams()
    if (q) qs.set("q", q)
    if (produto_id) qs.set("produto_id", produto_id)
    const query = qs.toString()
    return api.get(`/api/orcamentos/busca-por-produto${query ? `?${query}` : ""}`)
  },
  converterAvulsos: (id: string) => api.post(`/api/orcamentos/${id}/converter-avulsos-em-produtos`, {}),
  converterEmVenda: (id: string, payload?: { forma_pagamento?: string; observacoes?: string; parcelas?: number }) =>
    api.post(`/api/orcamentos/${id}/converter-em-venda`, payload || {}),
  prepararVenda: (id: string) => api.post(`/api/orcamentos/${id}/preparar-venda`, {}),
  notificarSeparacao: (id: string, payload: { notificar_atendente1: boolean; notificar_atendente2: boolean }) =>
    api.post(`/api/orcamentos/${id}/notificar-separacao`, payload),
}

export const indicacoesApi = {
  listar: (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/indicacoes/${query ? `?${query}` : ''}`)
  },
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/indicacoes/${id}`, dados),
}

export const entregasApi = {
  listar: (params?: {
    data_civil?: string
    data_inicio?: string
    data_fim?: string
    status?: string
    venda_id?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.data_civil) qs.set('data_civil', params.data_civil)
    if (params?.data_inicio) qs.set('data_inicio', params.data_inicio)
    if (params?.data_fim) qs.set('data_fim', params.data_fim)
    if (params?.status) qs.set('status', params.status)
    if (params?.venda_id) qs.set('venda_id', params.venda_id)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/entregas/${query ? `?${query}` : ''}`)
  },
  criar: (dados: Record<string, unknown>) => api.post('/api/entregas/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/entregas/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/entregas/${id}`),
  listarHistorico: (id: string) => api.get(`/api/entregas/${id}/historico`),
}

export const trocasApi = {
  listar: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.q) qs.set('q', params.q)
    const query = qs.toString()
    return api.get(`/api/trocas/${query ? `?${query}` : ''}`)
  },
  criar: (dados: any) => api.post('/api/trocas/', dados),
  atualizar: (id: string, dados: any) =>
    api.put(`/api/trocas/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/trocas/${id}`),
}

export const logisticaBoletosApi = {
  listarRotas: (params?: {
    data_inicio?: string
    data_fim?: string
    entregador_id?: string
    status?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.data_inicio) qs.set('data_inicio', params.data_inicio)
    if (params?.data_fim) qs.set('data_fim', params.data_fim)
    if (params?.entregador_id) qs.set('entregador_id', params.entregador_id)
    if (params?.status) qs.set('status', params.status)
    const query = qs.toString()
    return api.get(`/api/logistica/boletos/rotas${query ? `?${query}` : ''}`)
  },
  criarRota: (dados: {
    entregador_id: string
    data_rota?: string
    paradas: Array<{ cliente_id?: string | null; entrega_id?: string | null; ordem: number; observacao?: string }>
  }) => api.post('/api/logistica/boletos/rotas', dados),
  atualizarRota: (id: string, dados: any) => api.patch(`/api/logistica/boletos/rotas/${id}`, dados),
  atualizarParada: (id: string, dados: any) => api.patch(`/api/logistica/boletos/paradas/${id}`, dados),
  deletarRota: (id: string) => api.delete(`/api/logistica/boletos/rotas/${id}`),
  reordenarParadas: (paradas: Array<{ id: string; ordem: number }>) => api.post('/api/logistica/boletos/paradas/reordenar', { paradas }),
  adicionarParada: (rota_id: string, cliente_id: string, ordem: number = 0) => 
    api.post(`/api/logistica/boletos/paradas?rota_id=${rota_id}&cliente_id=${cliente_id}&ordem=${ordem}`, {}),
  removerParada: (id: string) => api.delete(`/api/logistica/boletos/paradas/${id}`),
}

export const logisticaGoogleApi = {
  otimizar: (destinos: string[], origem?: string) =>
    api.post('/api/logistica/google/otimizar', { destinos, origem }),
}

export const devolucoesApi = {
  listar: (params?: { status?: string; venda_id?: string; cliente_id?: string; q?: string; limit?: number; offset?: number; with_total?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.venda_id) qs.set('venda_id', params.venda_id)
    if (params?.cliente_id) qs.set('cliente_id', params.cliente_id)
    if (params?.q) qs.set('q', params.q)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    if (params?.with_total) qs.set('with_total', 'true')
    const query = qs.toString()
    return api.get(`/api/devolucoes/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/devolucoes/${id}`),
  itens: (id: string) => api.get(`/api/devolucoes/${id}/itens`),
  criar: (dados: Record<string, unknown>) => api.post('/api/devolucoes/', dados),
  criarCompleto: (dados: Record<string, unknown>) => api.post('/api/devolucoes/criar-completo', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/devolucoes/${id}`, dados),
  atualizarCompleto: (id: string, dados: Record<string, unknown>) => api.put(`/api/devolucoes/${id}/completo`, dados),
  deletar: (id: string) => api.delete(`/api/devolucoes/${id}`),
  marcarDevolvidaSeCompleta: (vendaId: string) =>
    api.post(`/api/devolucoes/marcar-devolvida-se-completa/${vendaId}`, {}),
}

export const plateApi = {
  listarHistorico: (params?: { limit?: number; offset?: number; placa?: string }) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(params?.limit ?? 30));
    qs.set('offset', String(params?.offset ?? 0));
    if (params?.placa) qs.set('placa', params.placa);
    return api.get(`/api/plate/searches?${qs.toString()}`);
  },
  balance: () => api.get('/api/plate/balance'),
  decode: (params: { plate: string; chassi?: string; engine?: string; atendenteId?: string; atendenteNome?: string }) => {
    const qs = new URLSearchParams()
    qs.set('placa', params.plate)
    if (params.chassi) qs.set('chassi', params.chassi)
    if (params.engine) qs.set('engine', params.engine)
    if (params.atendenteId) qs.set('atendenteId', params.atendenteId)
    if (params.atendenteNome) qs.set('atendenteNome', params.atendenteNome)
    return api.get(`/api/plate/decode?${qs.toString()}`)
  },
  payment: (valueCents: number) => api.post('/api/plate/payment', { valueCents }),
}

export const binApi = {
  consultar: (bin: string, opts?: { forcar?: boolean }) =>
    api.get(
      `/api/bin/${encodeURIComponent(bin)}${opts?.forcar ? '?forcar=true' : ''}`
    ),
  historico: (limit = 30) => api.get(`/api/bin/historico?limit=${limit}`),
  balance: () => api.get('/api/bin/balance'),
  payment: (valueCents: number) => api.post('/api/bin/payment', { valueCents }),
}

export const localizacoesApi = {
  listar: (params?: { q?: string; parent_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.parent_id) qs.set('parent_id', params.parent_id)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/localizacoes/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/localizacoes/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/localizacoes/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/localizacoes/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/localizacoes/${id}`),
}

export const sucatasApi = {
  listar: (params?: { status?: string; marca?: string; modelo?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.marca) qs.set('marca', params.marca)
    if (params?.modelo) qs.set('modelo', params.modelo)
    if (params?.q) qs.set('q', params.q)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/sucatas/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/sucatas/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/sucatas/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/sucatas/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/sucatas/${id}`),
  listarPecas: (id: string) => api.get(`/api/sucatas/${id}/pecas`),
  adicionarPeca: (id: string, peca: Record<string, unknown>) => api.post(`/api/sucatas/${id}/pecas`, peca),
  atualizarPeca: (id: string, pecaId: string, peca: Record<string, unknown>) => api.put(`/api/sucatas/${id}/pecas/${pecaId}`, peca),
  removerPeca: (id: string, pecaId: string) => api.delete(`/api/sucatas/${id}/pecas/${pecaId}`),
  bulkInserirPecas: (id: string, pecas: Record<string, unknown>[]) => api.post(`/api/sucatas/${id}/pecas/bulk`, pecas),
  aplicarRateio: (id: string) => api.post(`/api/sucatas/${id}/rateio`, {}),
  mergeCompat: (sucataId: string, produtoId: string) => api.post(`/api/sucatas/${sucataId}/merge-compat/${produtoId}`, {}),
  ensureLocalizacao: (sucataId: string) => api.post(`/api/sucatas/${sucataId}/ensure-localizacao`, {}),
  pecaToEstoque: (sucataId: string, pecaId: string, produto: Record<string, unknown>) => api.post(`/api/sucatas/${sucataId}/peca-to-estoque/${pecaId}`, produto),
  nextSku: () => api.get('/api/sucatas/next-sku'),
  relatorioComissoes: (mes: string) => api.get(`/api/sucatas/relatorios/comissoes?mes=${encodeURIComponent(mes)}`),
  relatorioVendasPecas: () => api.get('/api/sucatas/relatorios/vendas-pecas'),
  listarCompatibilidade: (sucataId: string) => api.get(`/api/sucatas/${sucataId}/compatibilidade`),
  bulkCompatibilidade: (sucataId: string, items: Record<string, unknown>[]) =>
    api.post(`/api/sucatas/${sucataId}/compatibilidade/bulk`, items),
  deletarCompatibilidade: (sucataId: string, compatId: string) =>
    api.delete(`/api/sucatas/${sucataId}/compatibilidade/${compatId}`),
  syncPecaFromProduto: (payload: { produto: Record<string, unknown>; sucata_id?: string | null }) =>
    api.post('/api/sucatas/sync-peca-from-produto', payload),
  pecaVinculoPorProduto: (produtoId: string) =>
    api.get(`/api/sucatas/peca-vinculo-por-produto/${produtoId}`),
}

export const catalogoApi = {
  listarPecas: (opts?: {
    recent?: boolean
    q?: string
    limit?: number
    offset?: number
    categoria_id?: string
  }) => {
    const qs = new URLSearchParams()
    if (opts?.recent) qs.set('recent', 'true')
    if (opts?.q) qs.set('q', opts.q)
    if (opts?.categoria_id) qs.set('categoria_id', opts.categoria_id)
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit))
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset))
    const query = qs.toString()
    return api.get(`/api/catalogo/pecas${query ? `?${query}` : ''}`)
  },
  /** Lista peças com compatibilidades em uma única query (paginação no CRM). */
  listarPecasComCompat: (opts?: {
    recent?: boolean
    q?: string
    limit?: number
    offset?: number
    categoria_id?: string
  }) => {
    const qs = new URLSearchParams()
    if (opts?.recent) qs.set('recent', 'true')
    if (opts?.q) qs.set('q', opts.q)
    if (opts?.categoria_id) qs.set('categoria_id', opts.categoria_id)
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit))
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset))
    const query = qs.toString()
    return api.get(`/api/catalogo/pecas-com-compat${query ? `?${query}` : ''}`)
  },
  /** IDs de peças que casam com TODOS os tokens. A interseção é feita no
   *  servidor: antes o navegador chamava uma vez por palavra e cruzava os
   *  conjuntos, multiplicando as varreduras no banco. */
  buscaIdsPecas: (tokens: string | string[], limit?: number) => {
    const lista = Array.isArray(tokens) ? tokens : [tokens]
    const qs = new URLSearchParams()
    for (const t of lista) {
      if (t && t.trim()) qs.append('token', t)
    }
    if (limit != null) qs.set('limit', String(limit))
    return api.get(`/api/catalogo/pecas/busca-ids?${qs}`)
  },
  buscaLinhasPecas: (token: string, limit?: number) => {
    const qs = new URLSearchParams({ token })
    if (limit != null) qs.set('limit', String(limit))
    return api.get(`/api/catalogo/pecas/busca-linhas?${qs}`)
  },
  pecaIdsPorCategoria: (categoriaId: string, limit?: number) => {
    const qs = new URLSearchParams({ categoria_id: categoriaId })
    if (limit != null) qs.set('limit', String(limit))
    return api.get(`/api/catalogo/pecas/ids-por-categoria?${qs}`)
  },
  lookupDuplicataCadastroPeca: (params: {
    nome: string
    categoria_id?: string | null
    marca_veiculo?: string | null
    modelo_veiculo?: string | null
  }) => {
    const qs = new URLSearchParams({ nome: params.nome })
    if (params.categoria_id) qs.set('categoria_id', params.categoria_id)
    if (params.marca_veiculo) qs.set('marca_veiculo', params.marca_veiculo)
    if (params.modelo_veiculo) qs.set('modelo_veiculo', params.modelo_veiculo)
    return api.get(`/api/catalogo/pecas/lookup-duplicata-cadastro?${qs}`)
  },
  detalhesPecasPorIds: (ids: string[]) => {
    if (!ids.length) return Promise.resolve([])
    const qs = new URLSearchParams()
    ids.forEach(id => qs.append('ids', id))
    return api.get(`/api/catalogo/pecas/por-ids?${qs}`)
  },
  detalhesPecasPorIdsPost: (ids: string[]) => api.post('/api/catalogo/pecas/detalhes-por-ids', ids),
  findPecaCatalogoByPn: (pn: string) =>
    api.get(`/api/catalogo/pecas/find-by-pn?pn=${encodeURIComponent(pn)}`),
  contagemProdutosEquivalentesPeca: (pecaId: string) =>
    api.get(
      `/api/catalogo/pecas/contagem-produtos-equivalentes?peca_id=${encodeURIComponent(pecaId)}`,
    ),
  listarCompatBulk: (pecaIds: string[]) => {
    const qs = new URLSearchParams({ peca_ids: pecaIds.join(',') })
    return api.get(`/api/catalogo/compatibilidade?${qs}`)
  },
  listarVariacoes: (categoriaId: string) =>
    api.get(`/api/catalogo/variacoes?categoria_id=${encodeURIComponent(categoriaId)}`),
  criarPeca: (dados: Record<string, unknown>) => api.post('/api/catalogo/pecas', dados),
  criarPecasBulk: (itens: Record<string, unknown>[]) => api.post('/api/catalogo/pecas/bulk', itens),
  atualizarPeca: (pecaId: string, dados: Record<string, unknown>) => api.put(`/api/catalogo/pecas/${pecaId}`, dados),
  atualizarPecasBulkPatch: (ids: string[], patch: Record<string, unknown>) =>
    api.put('/api/catalogo/pecas/bulk-patch', { ids, patch }),
  deletarPeca: (pecaId: string) => api.delete(`/api/catalogo/pecas/${pecaId}`),
  substituirCompat: (pecaId: string, items: Record<string, unknown>[]) =>
    api.put(`/api/catalogo/pecas/${pecaId}/compatibilidade`, items),
  substituirVariacaoPrecos: (pecaId: string, items: Record<string, unknown>[]) =>
    api.put(`/api/catalogo/pecas/${pecaId}/variacao-precos`, items),
  listarVariacaoPrecosPeca: (pecaId: string) => api.get(`/api/catalogo/pecas/${pecaId}/variacao-precos`),
  listarVeiculosMaster: () => api.get('/api/catalogo/veiculos-master'),
  listarVariacoesLabels: (categoriaId: string) =>
    api.get(`/api/catalogo/variacoes-labels?categoria_id=${encodeURIComponent(categoriaId)}`),
  sugerirIdsPecas: (categoriaId: string, tokens: string, excluirId?: string, limit?: number) => {
    const qs = new URLSearchParams({ categoria_id: categoriaId, tokens })
    if (excluirId) qs.set('excluir_id', excluirId)
    if (limit != null) qs.set('limit', String(limit))
    return api.get(`/api/catalogo/pecas/sugerir-ids?${qs}`)
  },
  criarVariacaoCategoria: (dados: Record<string, unknown>) => api.post('/api/catalogo/categorias-variacoes', dados),
  atualizarVariacaoCategoria: (variacaoId: string, dados: Record<string, unknown>) =>
    api.put(`/api/catalogo/categorias-variacoes/${variacaoId}`, dados),
  deletarVariacaoCategoria: (variacaoId: string) => api.delete(`/api/catalogo/categorias-variacoes/${variacaoId}`),
  veiculosMasterBulk: (items: Record<string, unknown>[]) => api.post('/api/catalogo/veiculos-master/bulk', items),

  // --- NOVOS MÉTODOS CATÁLOGO TÉCNICO (TECDOC) ---
  listarMontadoras: () => api.get('/api/catalogo/cat/montadoras'),
  criarMontadora: (dados: any) => api.post('/api/catalogo/cat/montadoras', dados),
  listarVeiculosTecnicos: (montadoraId?: string) => {
    const qs = montadoraId ? `?montadora_id=${montadoraId}` : ''
    return api.get(`/api/catalogo/cat/veiculos${qs}`)
  },
  criarVeiculoTecnico: (dados: any) => api.post('/api/catalogo/cat/veiculos', dados),
  listarMotoresTecnicos: () => api.get('/api/catalogo/cat/motores'),
  listarVersoesTecnicas: (veiculoId: string) => api.get(`/api/catalogo/cat/versoes?veiculo_id=${veiculoId}`),
  criarVersaoTecnica: (dados: any) => api.post('/api/catalogo/cat/versoes', dados),
  listarPecasTecnicas: (opts?: { q?: string; categoria_id?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (opts?.q) qs.set('q', opts.q)
    if (opts?.categoria_id) qs.set('categoria_id', opts.categoria_id)
    if (opts?.limit) qs.set('limit', String(opts.limit))
    const query = qs.toString()
    return api.get(`/api/catalogo/cat/pecas${query ? `?${query}` : ''}`)
  },
  criarPecaTecnica: (dados: any) => api.post('/api/catalogo/cat/pecas', dados),
  atualizarAplicacoesPeca: (pecaId: string, versoesIds: string[]) => 
    api.put(`/api/catalogo/cat/pecas/${pecaId}/aplicacoes`, versoesIds),
}

// --- NOVO SISTEMA DE CATÁLOGO DE AUTOPEÇAS ---
export const newCatalogApi = {
  // Models
  listarModels: (brand?: string, search?: string) => {
    const params = new URLSearchParams()
    if (brand) params.set('brand', brand)
    if (search) params.set('search', search)
    const query = params.toString()
    return api.get(`/api/catalog/models${query ? `?${query}` : ''}`)
  },
  listarModelYears: (modelId: string) => api.get(`/api/catalog/models/${modelId}/years`),
  listarModelVersions: (yearId: string) => api.get(`/api/catalog/years/${yearId}/versions`),
  
  // Parts
  listarParts: (search?: string, sku?: string) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (sku) params.set('sku', sku)
    const query = params.toString()
    return api.get(`/api/catalog/parts${query ? `?${query}` : ''}`)
  },
  criarPart: (dados: { sku: string; description: string }) => api.post('/api/catalog/parts', dados),
  listarPartApplications: (partId: string) => api.get(`/api/catalog/parts/${partId}/applications`),
  criarPartApplications: (partId: string, modelVersionIds: string[]) => 
    api.post(`/api/catalog/parts/${partId}/applications`, { model_version_ids: modelVersionIds }),
  deletarPartApplication: (partId: string, applicationId: string) => 
    api.delete(`/api/catalog/parts/${partId}/applications/${applicationId}`),
  
  // Utilitários
  getCatalogTree: () => api.get('/api/catalog/tree'),
  searchPartsByCompatibility: (modelVersionId: string) => 
    api.get(`/api/catalog/parts/search/by-compatibility?model_version_id=${modelVersionId}`),
}

export const carrinhoApi = {
  listar: () => api.get('/api/carrinho/'),
  adicionarItem: (item: { produto_id: string; quantidade: number; preco_unitario: number }) =>
    api.post('/api/carrinho/itens', item),
  atualizarItem: (itemId: string, dados: { quantidade?: number; preco_unitario?: number }) =>
    api.put(`/api/carrinho/itens/${itemId}`, dados),
  removerItem: (itemId: string) => api.delete(`/api/carrinho/itens/${itemId}`),
  limpar: () => api.delete('/api/carrinho/'),
  contagem: () => api.get('/api/carrinho/contagem'),
}

/** NF-e / fiscal — rotas Python (`/api/fiscal`). */
export const fiscalApi = {
  listarNotasFiscais: (params?: { data_inicio?: string; data_fim?: string; q?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.data_inicio) qs.set('data_inicio', params.data_inicio)
    if (params?.data_fim) qs.set('data_fim', params.data_fim)
    if (params?.q) qs.set('q', params.q)
    if (params?.limit) qs.set('limit', params.limit.toString())
    const query = qs.toString()
    return api.get(`/api/fiscal/nfe/notas${query ? `?${query}` : ''}`)
  },
  importar: (payload: Record<string, unknown>) => api.post('/api/fiscal/nfe/importar', payload),
}

/** MDF-e — rotas Python (`/api/fiscal/mdfe`). */
export const mdfeApi = {
  listar: (params?: { data_inicio?: string; data_fim?: string }) => {
    const qs = new URLSearchParams()
    if (params?.data_inicio) qs.set('data_inicio', params.data_inicio)
    if (params?.data_fim) qs.set('data_fim', params.data_fim)
    const query = qs.toString()
    return api.get(`/api/fiscal/mdfe/list${query ? `?${query}` : ''}`)
  },
  emitir: (dados: Record<string, unknown>) => api.post('/api/fiscal/mdfe/emit', dados),
  refresh: (id: string) => api.post(`/api/fiscal/mdfe/${id}/refresh`, {}),
  cancelar: (id: string, justificativa: string) =>
    api.post(`/api/fiscal/mdfe/${id}/cancelar`, { justificativa }),
  encerrar: (id: string, dados: { municipio_encerramento_ibge: string; municipio_encerramento_nome?: string; uf_encerramento: string }) =>
    api.post(`/api/fiscal/mdfe/${id}/encerrar`, dados),
  downloadUrl: (id: string, tipo: 'pdf' | 'xml') =>
    `${typeof window !== 'undefined' ? (window as any).__API_BASE__ || '' : ''}/api/fiscal/mdfe/${id}/download/${tipo}`,
}

export const cuponsApi = {
    listar: () => api.get('/api/cupons/'),
    detalhe: (id: string) => api.get(`/api/cupons/${id}`),
    criar: (dados: Record<string, unknown>) => api.post('/api/cupons/', dados),
    atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/cupons/${id}`, dados),
    deletar: (id: string) => api.delete(`/api/cupons/${id}`),
    validar: (codigo: string, valor_venda: number) => 
        api.post('/api/cupons/validar', { codigo, valor_venda }),
}

export const configuracoesApi = {
  obter: () => api.get('/api/configuracoes/empresa'),
  atualizar: (dados: Record<string, unknown>) => api.put('/api/configuracoes/empresa', dados),

  registrarFotoContribuicao: (body: Record<string, unknown>) =>
    api.post('/api/configuracoes/foto-contribuicoes', body),

  // Fornecedores
  listarFornecedores: () => api.get('/api/configuracoes/fornecedores'),
  criarFornecedor: (dados: Record<string, unknown>) => api.post('/api/configuracoes/fornecedores', dados),
  atualizarFornecedor: (id: string, dados: Record<string, unknown>) => api.put(`/api/configuracoes/fornecedores/${id}`, dados),
  deletarFornecedor: (id: string) => api.delete(`/api/configuracoes/fornecedores/${id}`),

  // Categorias
  listarCategorias: (params?: { q?: string; grupo?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.grupo) qs.set('grupo', params.grupo)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return api.get(`/api/configuracoes/categorias${query ? `?${query}` : ''}`)
  },
  criarCategoria: (dados: Record<string, unknown>) => api.post('/api/configuracoes/categorias', dados),
  atualizarCategoria: (id: string, dados: Record<string, unknown>) => api.put(`/api/configuracoes/categorias/${id}`, dados),
  deletarCategoria: (id: string) => api.delete(`/api/configuracoes/categorias/${id}`),

  // Financeiro Categorias
  listarFinanceiroCategorias: () => api.get('/api/configuracoes/financeiro-categorias'),
  criarFinanceiroCategoria: (dados: Record<string, unknown>) => api.post('/api/configuracoes/financeiro-categorias', dados),
  atualizarFinanceiroCategoria: (id: string, dados: Record<string, unknown>) => api.put(`/api/configuracoes/financeiro-categorias/${id}`, dados),
  deletarFinanceiroCategoria: (id: string) => api.delete(`/api/configuracoes/financeiro-categorias/${id}`),

  // Desmontadores
  listarDesmontadores: () => api.get('/api/configuracoes/desmontadores'),
  criarDesmontador: (dados: Record<string, unknown>) => api.post('/api/configuracoes/desmontadores', dados),
  atualizarDesmontador: (id: string, dados: Record<string, unknown>) => api.put(`/api/configuracoes/desmontadores/${id}`, dados),
  deletarDesmontador: (id: string) => api.delete(`/api/configuracoes/desmontadores/${id}`),

  // Veículos Marcas
  listarMarcas: () => api.get('/api/configuracoes/veiculos/marcas'),
  criarMarca: (dados: Record<string, unknown>) => api.post('/api/configuracoes/veiculos/marcas', dados),
  atualizarMarca: (id: string, dados: Record<string, unknown>) =>
    api.put(`/api/configuracoes/veiculos/marcas/${id}`, dados),
  deletarMarca: (id: string) => api.delete(`/api/configuracoes/veiculos/marcas/${id}`),

  // Veículos Modelos (veiculos_master)
  listarModelos: (marca?: string) => {
    const qs = marca ? `?marca=${encodeURIComponent(marca)}` : ''
    return api.get(`/api/configuracoes/veiculos/modelos${qs}`)
  },
  criarModelo: (dados: Record<string, unknown>) => api.post('/api/configuracoes/veiculos/modelos', dados),
  atualizarModelo: (id: string, dados: Record<string, unknown>) =>
    api.put(`/api/configuracoes/veiculos/modelos/${id}`, dados),
  deletarModelo: (id: string) => api.delete(`/api/configuracoes/veiculos/modelos/${id}`),

  // Transportadoras
  listarTransportadoras: (q?: string) => api.get(`/api/configuracoes/transportadoras${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  contagensAtendimentoTransportadoras: () =>
    api.get('/api/configuracoes/transportadoras/contagens-atendimento') as Promise<Record<string, number>>,
  criarTransportadora: (dados: {
    nome: string
    razao_social?: string | null
    documento?: string | null
    inscricao_estadual?: string | null
    contato?: string | null
  }) => api.post('/api/configuracoes/transportadoras', dados),
  atualizarTransportadora: (
    id: string,
    dados: Partial<{
      nome: string
      razao_social: string | null
      documento: string | null
      inscricao_estadual: string | null
      contato: string | null
    }>,
  ) => api.put(`/api/configuracoes/transportadoras/${id}`, dados),
  excluirTransportadora: (id: string) => api.delete(`/api/configuracoes/transportadoras/${id}`),
  listarAtendimentoTransportadora: (transportadoraId: string) =>
    api.get(`/api/configuracoes/transportadoras/${transportadoraId}/atendimento`),
  substituirAtendimentoTransportadora: (
    transportadoraId: string,
    body: {
      rows: Array<{
        transportadora_id: string
        uf: string
        cidade: string
        codigo_ibge: number
        valor_frete?: number | null
        prazo_dias?: number | null
      }>
    },
  ) => api.put(`/api/configuracoes/transportadoras/${transportadoraId}/atendimento`, body),

  sistemaLog: (body: {
    atendente_id?: string | null
    nivel: 'acao' | 'erro' | 'info'
    acao?: string | null
    mensagem: string
    codigo_erro?: string | null
    detalhe?: string | null
    origem?: string
  }) => api.post('/api/configuracoes/sistema-logs', body),

  /** Lista logs de auditoria (substitui supabase.from('sistema_logs')). */
  listarSistemaLogs: (params: {
    data: string
    atendente_id?: string
    nivel?: string
    busca?: string
    limit?: number
  }) => {
    const qs = new URLSearchParams()
    qs.set('data', params.data)
    if (params.atendente_id) qs.set('atendente_id', params.atendente_id)
    if (params.nivel && params.nivel !== 'todos') qs.set('nivel', params.nivel)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    return api.get(`/api/configuracoes/sistema-logs?${qs.toString()}`)
  },

  // Sistema de Atualizações
  checkPendingUpdates: () => api.get('/api/configuracoes/atualizacoes/pendentes') as Promise<any>,
  createUpdate: (body: { titulo: string; mensagem: string; versao?: string }) => 
    api.post('/api/configuracoes/atualizacoes', body),
  markUpdateAsRead: (id: string) => 
    api.post(`/api/configuracoes/atualizacoes/${id}/lido`, {}),
  listarUpdates: () => api.get('/api/configuracoes/atualizacoes'),
}

export const lojaApi = {
  listarPedidos: (params?: {
    status?: string
    client_id?: string
    search?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.client_id) qs.set('client_id', params.client_id)
    if (params?.search) qs.set('search', params.search)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/loja${query ? `?${query}` : ''}`)
  },
  listarClientesLoja: (params?: { search?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get(`/api/loja/customers${query ? `?${query}` : ''}`)
  },
  criarClienteLoja: (dados: Record<string, unknown>) => api.post('/api/loja/customers', dados),
  atualizarClienteLoja: (id: string, dados: Record<string, unknown>) => api.put(`/api/loja/customers/${id}`, dados),
  deletarClienteLoja: (id: string) => api.delete(`/api/loja/customers/${id}`),
  obterPedido: (orderId: string) => api.get(`/api/loja/${orderId}`),

  criar: (dados: Record<string, unknown>) => api.post('/api/loja/', dados),
  atualizar: (orderId: string, dados: Record<string, unknown>) => api.put(`/api/loja/${orderId}`, dados),
  deletar: (orderId: string) => api.delete(`/api/loja/${orderId}`),
}

export const metasApi = {
    listar: (mesAno: string) => api.get(`/api/metas-vendedores${mesAno ? `?mes_ano=${encodeURIComponent(mesAno)}` : ''}`),
    salvar: (payload: Record<string, unknown>) => api.post('/api/metas-vendedores', payload),
    atualizar: (id: string, payload: Record<string, unknown>) => api.put(`/api/metas-vendedores/${id}`, payload),
    deletar: (id: string) => api.delete(`/api/metas-vendedores/${id}`),
}

export const compraPedidosApi = {
    listar: () => api.get('/api/compra-pedidos/'),
    criar: (payload: Record<string, unknown>) => api.post('/api/compra-pedidos', payload),
    atualizar: (id: string, payload: Record<string, unknown>) => api.put(`/api/compra-pedidos/${id}`, payload),
    deletar: (id: string) => api.delete(`/api/compra-pedidos/${id}`),
}

export const compraNotasEntradaApi = {
    listar: () => api.get('/api/compra-notas-entrada'),
    criar: (payload: Record<string, unknown>) => api.post('/api/compra-notas-entrada', payload),
    atualizarDevolucao: (id: string, payload: Record<string, unknown>) => api.put(`/api/compra-notas-entrada/${id}/devolucao`, payload),
    deletar: (id: string) => api.delete(`/api/compra-notas-entrada/${id}`),
}

export const produtosUsoApi = {
    listar: () => api.get('/api/produtos-uso/'),
    criar: (payload: Record<string, unknown>) => api.post('/api/produtos-uso', payload),
    atualizar: (id: string, payload: Record<string, unknown>) => api.put(`/api/produtos-uso/${id}`, payload),
    deletar: (id: string) => api.delete(`/api/produtos-uso/${id}`),
}

export const mercadoLivreHubApi = {
  listarContas: () => api.get('/api/mercadolivre/auth/accounts'),
  dashboard: (accountId: string) => api.get(`/api/mercadolivre/dashboard/${accountId}`),
  dashboardInsights: (accountId: string) => api.get(`/api/mercadolivre/dashboard/${accountId}/insights`),
  dashboardJobsAtivos: (accountId: string) => api.get(`/api/mercadolivre/dashboard/${accountId}/jobs-ativos`),
  listarItens: (accountId: string, offset: number, limit: number, q?: string, sku?: string) =>
    api.get('/api/mercadolivre/items', { params: { account_id: accountId, offset, limit, ...(q ? { q } : {}), ...(sku ? { sku } : {}) } }),

  atualizarItem: (itemId: string, payload: Record<string, any>) =>
    api.put(`/api/mercadolivre/items/${itemId}`, payload),
  excluirItem: (itemId: string, accountId: string) =>
    api.delete(`/api/mercadolivre/items/${itemId}`, { params: { account_id: accountId } }),
  syncCenterExecutar: (payload: Record<string, unknown>) => api.post('/api/mercadolivre/sync-center/executar', payload),
  syncCenterHistorico: (accountId: string) => api.get(`/api/mercadolivre/sync-center/historico/${accountId}`),
  publicacaoMassa: (payload: Record<string, unknown>) => api.post('/api/mercadolivre/publicacao/massa', payload),
  reconciliacaoExecutar: (accountId: string) => api.post('/api/mercadolivre/reconciliacao/executar', null, { params: { account_id: accountId } }),
  reconciliacaoPendentes: (accountId: string) => api.get('/api/mercadolivre/reconciliacao/pendentes', { params: { account_id: accountId } }),
  reconciliacaoVincular: (payload: Record<string, unknown>) => api.post('/api/mercadolivre/reconciliacao/vincular', payload),
  integridadeExecutar: (accountId: string) => api.post('/api/mercadolivre/integridade/executar', null, { params: { account_id: accountId } }),
  integridadeResumo: (accountId: string) => api.get(`/api/mercadolivre/integridade/resumo/${accountId}`),
  divergencias: (accountId: string, offset: number, limit: number, tipo?: string) =>
    api.get(`/api/mercadolivre/divergencias/${accountId}`, { params: { offset, limit, tipo } }),
  divergenciasCorrigir: (payload: Record<string, unknown>) => api.post('/api/mercadolivre/divergencias/corrigir', payload),
  health: (accountId: string) => api.get(`/api/mercadolivre/health/${accountId}`),
  healthDiagnostics: (accountId: string) => api.post(`/api/mercadolivre/health/${accountId}/diagnostics`, null),
  historicoAuditoria: (accountId: string) => api.get('/api/mercadolivre/historico/auditoria', { params: { account_id: accountId } }),
  jobs: () => api.get('/api/mercadolivre/jobs'),
  jobsCriar: (payload: Record<string, unknown>) => api.post('/api/mercadolivre/jobs', payload),
  jobCancelar: (jobId: string) => api.post(`/api/mercadolivre/jobs/${jobId}/cancel`, null),
}

export const mercadolivreApi = {
  listarContas: () => api.get('/api/mercadolivre/accounts'),
  obterConta: (accountId: string) => api.get(`/api/mercadolivre/accounts/${accountId}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/mercadolivre/accounts', dados),
  atualizar: (accountId: string, dados: Record<string, unknown>) => api.put(`/api/mercadolivre/accounts/${accountId}`, dados),
  deletar: (accountId: string) => api.delete(`/api/mercadolivre/accounts/${accountId}`),

  alertsPending: () =>
    api.get('/api/mercadolivre/alerts/pending') as Promise<{
      questions: Array<Record<string, unknown> & { id: string; ml_question_id: string; ml_account_id: string }>
      sales: Array<Record<string, unknown> & { id: string; total: number }>
      messages: Array<Record<string, unknown> & { id: string; pack_id: string; order_id?: string; text: string; from_nickname: string }>
      sku_by_item_id: Record<string, string | null>
    }>,
  alertDismissQuestion: (openQuestionId: string) =>
    api.post('/api/mercadolivre/alerts/dismiss-question', { open_question_id: openQuestionId }),
  alertDismissVenda: (vendaId: string) =>
    api.post('/api/mercadolivre/alerts/dismiss-venda', { venda_id: vendaId }),
  alertDismissMessage: (packId: string) =>
    api.post('/api/mercadolivre/alerts/dismiss-message', { pack_id: packId }),
  alertAcknowledgeVenda: (vendaId: string) =>
    api.patch(`/api/mercadolivre/alerts/venda/${vendaId}/acknowledge`, {}),
}

/** Consultas pagas na API Full (JWT obrigatório). Histórico/cache no backend evita cobrança duplicada. */
export const consultasApi = {
    fipe: (placa: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/fipe', { placa, ...(opts?.forcar ? { forcar: true } : {}) }),
    cpfScoreDividas: (cpf: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/cpf-score-dividas', { cpf, ...(opts?.forcar ? { forcar: true } : {}) }),
    credCompleta: (document: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/cred-completa', { document, ...(opts?.forcar ? { forcar: true } : {}) }),
    cnpj: (cnpj: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/cnpj', { cnpj, ...(opts?.forcar ? { forcar: true } : {}) }),
    boaVista: (document: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/boa-vista', { document, ...(opts?.forcar ? { forcar: true } : {}) }),
    quod: (document: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/quod', { document, ...(opts?.forcar ? { forcar: true } : {}) }),
    historicoRouboFurto: (placa: string, opts?: { forcar?: boolean }) =>
        api.post('/api/consultas/historico-roubo-furto', { placa, ...(opts?.forcar ? { forcar: true } : {}) }),
    listarHistorico: (limit = 80) => api.get(`/api/consultas/historico?limit=${encodeURIComponent(String(limit))}`),
    historicoDetalhe: (id: string) => api.get(`/api/consultas/historico/${encodeURIComponent(id)}`),
    checkHistorico: (tipo: string, chave: string) =>
        api.get(`/api/consultas/historico/check?tipo=${encodeURIComponent(tipo)}&chave=${encodeURIComponent(chave)}`),
    balance: () => api.get('/api/plate/balance'),
}

/** Upload de imagem de produto (painel) — otimização + MinIO no backend. */
export const adminApi = {
  uploadProdutoImagem: (formData: FormData) =>
    api.postForm('/api/admin/upload-produto-imagem', formData),
  produtoBucketReferencias: () => api.get('/api/admin/produto-bucket-referencias'),
}
export const boletosApi = {
    relatorioDetalhado: () => api.get('/api/boletos/relatorio-detalhado'),
    listarClientesPendentes: () => api.get('/api/boletos/clientes-pendentes'),
    listarPendenciasCliente: (clienteId: string) => 
        api.get(`/api/boletos/pendencias/${clienteId}`),
    registrarEmissao: (data: { 
        cliente_id: string, 
        lancamentos_ids: string[], 
        valor_total: number, 
        multa?: number, 
        juros?: number, 
        qtd_parcelas?: number,
        valor_parcela?: number,
        parcelas?: { numero: number; valor: number; data_vencimento: string }[],
        atendente_id?: string,
        gerar_logistica?: boolean
    }) => api.post(`/api/boletos/registrar-emissao`, data),
    listarHistorico: (clienteId: string) => 
        api.get(`/api/boletos/historico/${clienteId}`),
    listarTodasEmissoes: (params?: { q?: string; limit?: number }) => {
        const qs = new URLSearchParams()
        if (params?.q) qs.set('q', params.q)
        if (params?.limit) qs.set('limit', params.limit.toString())
        const query = qs.toString()
        return api.get(`/api/boletos/emissoes${query ? `?${query}` : ''}`)
    },
    reenviarWhatsAppBoleto: (emissaoId: string) =>
        api.post(`/api/boletos/emissoes/${emissaoId}/reenviar-whatsapp`, {}),
    pagarEmissao: (emissaoId: string, atendenteId?: string) =>
        api.patch(`/api/boletos/emissoes/${emissaoId}/pagar`, { atendente_id: atendenteId }),
    pagarParcela: (parcelaId: string) =>
        api.patch(`/api/boletos/parcelas/${parcelaId}/pagar`, {}),
    atualizarContatoEmpresa: (clienteId: string, data: { empresa_nome?: string; empresa_whatsapp?: string }) =>
        api.patch(`/api/boletos/clientes/${clienteId}/contato-empresa`, data),
    relatorioVendasEmissao: (emissaoId: string) =>
        api.get(`/api/boletos/emissoes/${emissaoId}/relatorio-vendas`),
    relatorioVendasPreview: (lancamentosIds: string[]) =>
        api.post(`/api/boletos/emissoes/relatorio-vendas-preview`, { lancamentos_ids: lancamentosIds }),
    excluirEmissao: (emissaoId: string) =>
        api.delete(`/api/boletos/emissoes/${emissaoId}`),
    agendarAvisoParcela: (parcelaId: string, dataHoraAviso: string | null) =>
        api.put(`/api/boletos/emissoes/parcelas/${parcelaId}/aviso`, { data_hora_aviso: dataHoraAviso }),
}


export const whatsappApi = {
    listarInstancias: () => api.get('/api/whatsapp/instancias'),
    criarInstancia: (dados: { nome: string, instance_name: string, atendente_id?: string }) =>
        api.post('/api/whatsapp/instancias', dados),
    atualizarInstancia: (id: string, dados: { nome: string, instance_name: string, atendente_id?: string }) =>
        api.put(`/api/whatsapp/instancias/${id}`, dados),
    deletarInstancia: (id: string) => api.delete(`/api/whatsapp/instancias/${id}`),
    conectarInstancia: (instanceName: string) => api.get(`/api/whatsapp/instancias/${instanceName}/connect`),
    autoConectarInstancia: () => api.post('/api/whatsapp/instancias/auto-connect', {}),
    verificarStatusInstancia: (instanceName: string) => api.get(`/api/whatsapp/instancias/${instanceName}/status`),
    transferirAtendimento: (dados: { telefone: string, nova_instancia_id: string, nota?: string }) =>
        api.post('/api/whatsapp/transferir', dados),
    logoutInstancia: (instanceName: string) => api.post(`/api/whatsapp/instancias/${instanceName}/logout`, {}),
    limparMensagensOrfas: () => api.post('/api/whatsapp/limpar-mensagens-orfas', {}),

    // Contatos
    listarContatos: () => api.get('/api/whatsapp/contatos'),
    criarContato: (dados: any) => api.post('/api/whatsapp/contatos', dados),
    atualizarContato: (id: string, dados: any) => api.put(`/api/whatsapp/contatos/${id}`, dados),
    deletarContato: (id: string) => api.delete(`/api/whatsapp/contatos/${id}`),
    atualizarFotosContatos: () => api.post('/api/whatsapp/contatos/refresh-all', {}),

    // Tags
    listarTags: () => api.get('/api/whatsapp/tags'),
    criarTag: (dados: any) => api.post('/api/whatsapp/tags', dados),
    atualizarTag: (id: string, dados: any) => api.put(`/api/whatsapp/tags/${id}`, dados),
    deletarTag: (id: string) => api.delete(`/api/whatsapp/tags/${id}`),

    // Categorias
    listarCategorias: () => api.get('/api/whatsapp/categorias'),
    criarCategoria: (dados: any) => api.post('/api/whatsapp/categorias', dados),
    atualizarCategoria: (id: string, dados: any) => api.put(`/api/whatsapp/categorias/${id}`, dados),
    deletarCategoria: (id: string) => api.delete(`/api/whatsapp/categorias/${id}`),
}

export const automacoesApi = {
    getConfigs: () => api.get('/api/automacoes/configs'),
    updateConfig: (tipo: string, data: any) => api.put(`/api/automacoes/configs/${tipo}`, data),
    getLogs: () => api.get('/api/automacoes/logs'),
}

export const mercadoLivreApi = {
  // Vendas do Mercado Livre
  listarVendas: (params: {
    account_id: string
    status?: string
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    qs.set('account_id', params.account_id)
    if (params.status) qs.set('status', params.status)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    return api.get(`/api/mercadolivre/orders?${qs}`)
  },

  // Mensagens de uma venda
  buscarMensagens: (orderId: string, params: {
    account_id: string
    mark_as_read?: boolean
  }) => {
    const qs = new URLSearchParams()
    qs.set('account_id', params.account_id)
    if (params.mark_as_read !== undefined) qs.set('mark_as_read', String(params.mark_as_read))
    return api.get(`/api/mercadolivre/orders/${orderId}/messages?${qs}`)
  },

  // Enviar mensagem para comprador
  enviarMensagem: (orderId: string, data: {
    account_id: string
    text: string
  }) => api.post(`/api/mercadolivre/orders/${orderId}/messages`, data),

  // Mensagens não lidas
  mensagensNaoLidas: (account_id: string) => {
    const qs = new URLSearchParams()
    qs.set('account_id', account_id)
    return api.get(`/api/mercadolivre/messages/unread?${qs}`)
  },

  // Sincronizar vendas existentes
  sincronizarVendas: (account_id: string, days = 30) => {
    return api.post('/api/mercadolivre/orders/sync', {
      account_id,
      days
    })
  },

  // Busca em cascata e compatibilidade de veículos do Mercado Livre
  listarMarcasVeiculos: () => api.get('/api/mercadolivre/vehicles/brands'),
  listarModelosVeiculos: (brandId: string) => api.get(`/api/mercadolivre/vehicles/models/${brandId}`),
  listarFilhosCategoria: (categoryId: string) => api.get(`/api/mercadolivre/vehicles/children/${categoryId}`),
  listarAnosVeiculos: (brandId: string, modelId: string) =>
    api.get(`/api/mercadolivre/vehicles/years/${brandId}/${modelId}`),
  listarVersoesVeiculos: (brandId: string, modelId: string, yearId: string) =>
    api.get(`/api/mercadolivre/vehicles/trims/${brandId}/${modelId}/${yearId}`),
  obterCompatibilidadesMl: (meliId: string) => api.get(`/api/mercadolivre/vehicles/compatibilities/${meliId}`),
  buscarVeiculosPorCampos: (fields: {
    marca: string;
    modelo: string;
    ano_inicio?: number | null;
    ano_fim?: number | null;
    motorizacao?: string | null;
  }) => api.post('/api/mercadolivre/vehicles/search-by-fields', fields),
  getMlVehicleBrands: () => api.get('/api/mercadolivre/vehicles/brands'),
  getMlCategoryChildren: (categoryId: string) => api.get(`/api/mercadolivre/vehicles/categories/${categoryId}`),

  analisarTitulo: (title: string) =>
    api.post('/api/mercadolivre/analyze-title', { title }),

  // Novas funcoes de Catalogo ML
  preverCategoria: (title: string) => api.get(`/api/mercadolivre/predict-category?title=${encodeURIComponent(title)}`),
  obterAtributosCategoria: (categoryId: string) => api.get(`/api/mercadolivre/attributes/${categoryId}`),
  pesquisarCategorias: (q: string) => api.get(`/api/mercadolivre/catalog/search?q=${encodeURIComponent(q)}`),

  // Funções existentes (compatibilidade)
  listarContas: () => api.get('/api/mercadolivre/accounts'),
  listarPerguntas: (account_id: string) => {
    const qs = new URLSearchParams()
    qs.set('account_id', account_id)
    return api.get(`/api/mercadolivre/questions?${qs}`)
  },
  responderPergunta: (data: {
    account_id: string
    question_id: string
    text: string
  }) => api.post('/api/mercadolivre/questions/answer', data),

  // Desvincular link do produto
  desvincularProdutoLink: (linkId: string) => api.delete(`/api/mercadolivre/product-links/${linkId}`),
}

export const manutencoesApi = {
  listar: (params?: { status?: string; tipo?: string; produto_id?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.tipo) qs.set('tipo', params.tipo)
    if (params?.produto_id) qs.set('produto_id', params.produto_id)
    const query = qs.toString()
    return api.get(`/api/manutencoes/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/manutencoes/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/manutencoes/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/manutencoes/${id}`, dados),
  adicionarRetifica: (id: string, dados: Record<string, unknown>) => api.post(`/api/manutencoes/${id}/retificas`, dados),
  atualizarRetifica: (id: string, retificaId: string, dados: Record<string, unknown>) => api.put(`/api/manutencoes/${id}/retificas/${retificaId}`, dados),
  deletarRetifica: (id: string, retificaId: string) => api.delete(`/api/manutencoes/${id}/retificas/${retificaId}`),
  adicionarInsumo: (id: string, dados: Record<string, unknown>) => api.post(`/api/manutencoes/${id}/insumos`, dados),
  atualizarInsumo: (id: string, insumoId: string, dados: Record<string, unknown>) => api.put(`/api/manutencoes/${id}/insumos/${insumoId}`, dados),
  deletarInsumo: (id: string, insumoId: string) => api.delete(`/api/manutencoes/${id}/insumos/${insumoId}`),
}

// ─── LOGÍSTICA INTELIGENTE ──────────────────────────────────────────────────

export const logisticaVeiculosApi = {
  listar: (ativo?: boolean) => {
    const qs = ativo !== undefined ? `?ativo=${ativo}` : ''
    return api.get(`/api/logistica/veiculos/${qs}`)
  },
  disponiveis: () => api.get('/api/logistica/veiculos/disponiveis'),
  detalhe: (id: string) => api.get(`/api/logistica/veiculos/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/logistica/veiculos/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/logistica/veiculos/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/logistica/veiculos/${id}`),
}

export const logisticaRotasApi = {
  listar: (params?: { data_rota?: string; status?: string; motorista_id?: string }) => {
    const qs = new URLSearchParams()
    if (params?.data_rota) qs.set('data_rota', params.data_rota)
    if (params?.status) qs.set('status', params.status)
    if (params?.motorista_id) qs.set('motorista_id', params.motorista_id)
    const query = qs.toString()
    return api.get(`/api/logistica/rotas/${query ? `?${query}` : ''}`)
  },
  detalhe: (id: string) => api.get(`/api/logistica/rotas/${id}`),
  criar: (dados: Record<string, unknown>) => api.post('/api/logistica/rotas/', dados),
  atualizar: (id: string, dados: Record<string, unknown>) => api.put(`/api/logistica/rotas/${id}`, dados),
  deletar: (id: string) => api.delete(`/api/logistica/rotas/${id}`),
  atribuirEntregas: (rotaId: string, entregaIds: string[]) =>
    api.post(`/api/logistica/rotas/${rotaId}/atribuir-entregas`, { entrega_ids: entregaIds }),
  reordenar: (rotaId: string, entregaIds: string[]) =>
    api.post(`/api/logistica/rotas/${rotaId}/reordenar`, entregaIds),
  otimizar: (rotaId: string, origem?: string, primeira_entrega_id?: string) =>
    api.post(`/api/logistica/rotas/${rotaId}/otimizar`, { origem, primeira_entrega_id }),
}

export const logisticaRastreamentoApi = {
  atualizarPosicao: (dados: {
    latitude: number
    longitude: number
    velocidade?: number
    heading?: number
    precisao?: number
    bateria?: number
    entrega_id_ativa?: string
  }) => api.post('/api/logistica/rastreamento/posicao', dados),

  motoristasAtivos: () => api.get('/api/logistica/rastreamento/motoristas-ativos'),

  // PIN administrativo validado no servidor (nunca fica no bundle do app)
  validarPinAdmin: (pin: string, acao?: string) =>
    api.post('/api/logistica/rastreamento/validar-pin-admin', { pin, acao }),

  // ETA (distância + tempo estimado) do motorista até o destino da entrega
  eta: (entregaId: string) =>
    api.get(`/api/logistica/rastreamento/${entregaId}/eta`),

  consultarPublico: (codigo: string) =>
    api.get(`/api/logistica/rastreamento/publico/${codigo}`),

  iniciarSessao: (dados: { veiculo_id?: string; rota_id?: string; km_inicial?: number }) =>
    api.post('/api/logistica/rastreamento/sessao/iniciar', dados),

  finalizarSessao: (dados?: { km_final?: number }) =>
    api.post('/api/logistica/rastreamento/sessao/finalizar', dados || {}),

  confirmarEntrega: (entregaId: string, dados: {
    nome_recebedor: string
    foto_url?: string
    assinatura_url?: string
    cliente_recusou_foto?: boolean
    motivo_recusa?: string
    latitude?: number
    longitude?: number
    observacoes?: string
  }) => api.post(`/api/logistica/rastreamento/${entregaId}/confirmar`, dados),

  timeline: (entregaId: string) =>
    api.get(`/api/logistica/rastreamento/${entregaId}/timeline`),

  historicoGps: (entregaId: string) =>
    api.get(`/api/logistica/rastreamento/${entregaId}/historico-gps`),

  registrarEvento: (entregaId: string, tipo_evento: string, descricao?: string) => {
    const qs = new URLSearchParams({ entrega_id: entregaId, tipo_evento })
    if (descricao) qs.set('descricao', descricao)
    return api.post(`/api/logistica/rastreamento/timeline/evento?${qs}`, {})
  },

  trajetoSessaoAtiva: (motoristaId: string) =>
    api.get(`/api/logistica/rastreamento/sessao-ativa/${motoristaId}/trajeto`),

  // Geocoding/Roads via backend — a chave do navegador é restrita por HTTP
  // referrer (necessário para a Maps JavaScript API), mas as APIs REST do
  // Google (Geocoding, Roads) rejeitam chaves com essa restrição. Por isso
  // essas chamadas passam pelo servidor, que usa a chave sem restrição.
  geocode: (endereco: string) =>
    api.post('/api/logistica/rastreamento/geocode', { endereco }),

  snapToRoads: (pontos: { lat: number; lng: number }[]) =>
    api.post('/api/logistica/rastreamento/snap-to-roads', { pontos }),
}
