import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, ShoppingBag, X, DollarSign, Receipt, Barcode, Package, FileText } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { hasCrmPathAccess } from '@/config/crmRoutePermissions'
import { clientesApi, vendasApi, financeiroApi, fiscalApi, boletosApi, estoqueApi, orcamentosApi } from '@/lib/api'

interface SearchResult {
    id: string
    type: 'cliente' | 'venda' | 'pagina' | 'lancamento' | 'fiscal' | 'boleto' | 'produto' | 'orcamento'
    title: string
    subtitle: string
    url: string
}

export function CommandMenu() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const navigate = useNavigate()
    const inputRef = useRef<HTMLInputElement>(null)
    const { atendente } = useAuthStore()

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [])

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100)
        } else {
            setQuery('')
            setResults([])
            setSelectedIndex(0)
        }
    }, [open])

    useEffect(() => {
        if (!query.trim()) {
            setResults([])
            return
        }

        const search = async () => {
            setLoading(true)
            try {
                const q = query.trim().replace(/[\s\-]+/g, '%')
                const [cliRes, vendRes, finRes, fiscRes, bolRes, prodRes, orcRes] = await Promise.all([
                    clientesApi.listar({ q, limit: 20 }).catch(() => null),
                    vendasApi.listar({ q, limit: 20 }).catch(() => null),
                    financeiroApi.listar({ q, limit: 20 }).catch(() => null),
                    fiscalApi.listarNotasFiscais({ q, limit: 20 }).catch(() => null),
                    boletosApi.listarTodasEmissoes({ q, limit: 20 }).catch(() => null),
                    estoqueApi.listarProdutos({ q, limit: 20 }).catch(() => null),
                    orcamentosApi.listar({ q, limit: 20 }).catch(() => null)
                ])

                const newResults: SearchResult[] = []

                // 0. Buscar páginas internas (Navigation)
                const pages = [
                    { label: 'Configurações', url: '/configuracoes', keywords: ['config', 'setup', 'preferencias', 'atendentes', 'empresa'] },
                    { label: 'Transportadoras', url: '/transportadoras', keywords: ['frete', 'transporte', 'entrega', 'cotacao', 'cidades', 'areas'] },

                    { label: 'Dashboard', url: '/', keywords: ['home', 'painel', 'index'] },
                    { label: 'Estoque / Produtos', url: '/produtos', keywords: ['pecas', 'inventario'] },
                    { label: 'Pedidos de compra', url: '/pedidos-compra', keywords: ['fornecedor', 'compra', 'reposicao', 'pedido compra'] },
                    { label: 'Alteração em Massa', url: '/produtos/alteracao-massa', keywords: ['planilha', 'excel', 'editar', 'massa', 'lote'] },
                    { label: 'Financeiro', url: '/financeiro', keywords: ['contas', 'caixa', 'pagamentos'] },
                    { label: 'Relatórios', url: '/relatorios', keywords: ['graficos', 'pdf', 'vendas'] },
                    { label: 'Registro de atividades', url: '/logs', keywords: ['logs', 'auditoria', 'erros', 'historico', 'atividades'] },
                    { label: 'Clientes', url: '/clientes', keywords: ['cadastro', 'leads'] },
                    { label: 'Orçamentos', url: '/orcamentos', keywords: ['cotacao', 'proposta', 'orcamento'] },
                    { label: 'Fiscal (NFe)', url: '/fiscal/nfe', keywords: ['notas', 'xml', 'danfe', 'fiscal', 'nfe'] },
                    { label: 'Boletos', url: '/controle-boletos', keywords: ['boleto', 'cobranca', 'banco'] },
                ]

                pages.forEach(p => {
                    if (!atendente || !hasCrmPathAccess(p.url, atendente)) return
                    if (p.label.toLowerCase().includes(query.toLowerCase()) || p.keywords.some(k => k.includes(query.toLowerCase()))) {
                        newResults.push({
                            id: `page-${p.url}`,
                            type: 'pagina',
                            title: p.label,
                            subtitle: `Navegar para ${p.label}`,
                            url: p.url
                        })
                    }
                })

                if (cliRes && atendente && hasCrmPathAccess('/clientes', atendente)) {
                    cliRes.forEach((c: any) => newResults.push({
                        id: `c-${c.id}`, type: 'cliente', title: c.nome,
                        subtitle: `Tel: ${c.telefone}`, url: `/clientes?edit=${c.id}`
                    }))
                }

                if (vendRes && atendente && hasCrmPathAccess('/vendas', atendente)) {
                    vendRes.forEach((v: any) => newResults.push({
                        id: `v-${v.id}`, type: 'venda', title: `Venda #${v.id}`,
                        subtitle: `Cliente: ${v.cliente_nome || 'N/I'} | R$ ${v.total}`, url: `/vendas?edit=${v.id}`
                    }))
                }

                if (prodRes && atendente && hasCrmPathAccess('/produtos', atendente)) {
                    prodRes.forEach((p: any) => newResults.push({
                        id: `p-${p.id}`, type: 'produto', title: p.nome,
                        subtitle: `Estoque: ${p.quantidade || 0} | Preço: R$ ${p.preco_venda}`, url: `/produtos?edit=${p.id}`
                    }))
                }

                if (orcRes && atendente && hasCrmPathAccess('/orcamentos', atendente)) {
                    orcRes.forEach((o: any) => newResults.push({
                        id: `o-${o.id}`, type: 'orcamento', title: `Orçamento #${o.id}`,
                        subtitle: `Cliente: ${o.cliente?.nome || 'N/I'} | R$ ${o.valor_total}`, url: `/orcamentos?edit=${o.id}`
                    }))
                }

                if (finRes && finRes.items && Array.isArray(finRes.items) && atendente && hasCrmPathAccess('/financeiro', atendente)) {
                    finRes.items.forEach((f: any) => newResults.push({
                        id: `f-${f.id}`, type: 'lancamento', title: `Lançamento #${f.id}`,
                        subtitle: `${f.descricao} | R$ ${f.valor} | ${f.status}`, url: `/financeiro?edit=${f.id}`
                    }))
                }

                if (fiscRes && Array.isArray(fiscRes) && atendente && hasCrmPathAccess('/fiscal', atendente)) {
                    fiscRes.forEach((f: any) => newResults.push({
                        id: `nf-${f.id}`, type: 'fiscal', title: `Nota Fiscal #${f.numero || 'S/N'}`,
                        subtitle: `Dest: ${f.clientes?.nome || 'N/I'} | R$ ${f.valor_total || 0}`, url: `/fiscal/nfe?edit=${f.id}`
                    }))
                }

                if (bolRes && Array.isArray(bolRes) && atendente && hasCrmPathAccess('/controle-boletos', atendente)) {
                    bolRes.forEach((b: any) => newResults.push({
                        id: `bol-${b.id}`, type: 'boleto', title: `Boleto Emissão #${b.id}`,
                        subtitle: `Cliente: ${b.cliente_nome || 'N/I'} | R$ ${b.valor_total || 0}`, url: `/controle-boletos?edit=${b.id}`
                    }))
                }

                // if query is exact number for sales, fallback check
                if (!isNaN(Number(query)) && atendente && hasCrmPathAccess('/vendas', atendente)) {
                    const numFetch = await vendasApi.listar({ q: query, limit: 3 });
                    if (numFetch) {
                        numFetch.forEach((v: any) => {
                            if (!newResults.some(nr => nr.id === `v-${v.id}`)) {
                                newResults.push({
                                    id: `v-${v.id}`, type: 'venda', title: `Venda #${v.id}`,
                                    subtitle: `Cliente: ${v.cliente_nome || 'N/I'} | R$ ${v.total}`, url: `/vendas?edit=${v.id}`
                                })
                            }
                        })
                    }
                }

                setResults(newResults)
                setSelectedIndex(0)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }

        const throttle = setTimeout(search, 300)
        return () => clearTimeout(throttle)
    }, [query, atendente])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex((prev) => (prev + 1) % results.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex((prev) => (prev - 1 + results.length) % results.length)
        } else if (e.key === 'Enter' && results.length > 0) {
            e.preventDefault()
            handleSelect(results[selectedIndex])
        } else if (e.key === 'Escape') {
            setOpen(false)
        }
    }

    const handleSelect = (res: SearchResult) => {
        setOpen(false)
        navigate(res.url)
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] px-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                onClick={() => setOpen(false)}
            />

            {/* Modal Principal (Glassmorphism) */}
            <div className="relative w-full max-w-2xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center border-b border-border/50 px-4">
                    <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                    <input
                        ref={inputRef}
                        className="flex h-14 w-full bg-transparent py-4 mx-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Buscar produtos, clientes ou nº da venda..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border uppercase tracking-widest hidden sm:block">ESC</div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                    {!query && (
                        <div className="py-14 text-center text-sm text-muted-foreground">
                            Digite para começar a buscar.
                        </div>
                    )}

                    {query && loading && results.length === 0 && (
                        <div className="py-14 text-center text-sm text-muted-foreground animate-pulse">
                            Buscando...
                        </div>
                    )}

                    {query && !loading && results.length === 0 && (
                        <div className="py-14 text-center text-sm text-muted-foreground">
                            Nenhum resultado encontrado para "{query}"
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-1">
                            {results.map((res, idx) => {
                                const isSelected = idx === selectedIndex
                                const Icon = res.type === 'cliente'
                                    ? Users
                                    : res.type === 'venda'
                                        ? ShoppingBag
                                        : res.type === 'lancamento'
                                            ? DollarSign
                                            : res.type === 'fiscal'
                                                ? Receipt
                                                : res.type === 'boleto'
                                                    ? Barcode
                                                    : res.type === 'produto'
                                                        ? Package
                                                        : res.type === 'orcamento'
                                                            ? FileText
                                                            : Search // Icon for pages

                                return (
                                    <div
                                        key={res.id}
                                        onClick={() => handleSelect(res)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors ${isSelected
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'hover:bg-muted text-foreground'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-md ${isSelected ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col">
                                            <span className="text-sm font-bold truncate">{res.title}</span>
                                            <span className={`text-[10px] truncate ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                                {res.subtitle}
                                            </span>
                                        </div>
                                        <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-black/10 dark:bg-white/10`}>
                                            {res.type}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
