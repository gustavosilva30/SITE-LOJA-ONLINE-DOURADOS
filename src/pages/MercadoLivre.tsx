import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShoppingBag, RefreshCw, Link as LinkIcon, ExternalLink, AlertCircle, Plus, MessageSquare, ChevronLeft, ChevronRight, Send, Trash2, LogOut } from "lucide-react"
import { estoqueApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { mercadolivreApi } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"

export function MercadoLivre() {
    const [accounts, setAccounts] = useState<any[]>([])
    const [selectedAccount, setSelectedAccount] = useState<any>(null)
    const [items, setItems] = useState<any[]>([])
    const [totalItems, setTotalItems] = useState(0)
    const [offset, setOffset] = useState(0)
    const limit = 20

    const [questions, setQuestions] = useState<any[]>([])
    const [answering, setAnswering] = useState<string | null>(null)
    const [answerText, setAnswerText] = useState("")
    const [isThreadOpen, setIsThreadOpen] = useState(false)
    const [threadLoading, setThreadLoading] = useState(false)
    const [threadTitle, setThreadTitle] = useState<string>("")
    const [threadQuestions, setThreadQuestions] = useState<any[]>([])

    const [loading, setLoading] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
    const [selectedMLItem, setSelectedMLItem] = useState<any>(null)
    const [searchProduct, setSearchProduct] = useState("")
    const [foundProducts, setFoundProducts] = useState<any[]>([])

    const { atendente } = useAuthStore()

    const fetchAccounts = async () => {
        try {
            const data = await mercadolivreApi.listarContas()
            setAccounts(data || [])
            if (data && data.length > 0 && !selectedAccount) {
                setSelectedAccount(data[0])
            }
        } catch (err) {
            console.error('Erro ao buscar contas ML:', err)
        }
    }

    const fetchItems = async () => {
        if (!selectedAccount) return
        setLoading(true)
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/items?account_id=${selectedAccount.id}&offset=${offset}&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await response.json()
            setItems(data.items || [])
            setTotalItems(data.total || 0)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const fetchQuestions = async () => {
        if (!selectedAccount) return
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/questions?account_id=${selectedAccount.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await response.json()
            setQuestions(data.questions || [])
        } catch (err) {
            console.error(err)
        }
    }

    const openThread = async (q: any, e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation() }
        if (!selectedAccount) return
        const itemId = String(q?.item_id || q?.item?.id || "")
        const fromId = String(q?.from?.id || q?.customer?.id || "")
        if (!itemId || !fromId) {
            alert("Não foi possível identificar item/cliente para carregar o histórico.")
            return
        }

        setIsThreadOpen(true)
        setThreadLoading(true)
        setThreadQuestions([])
        setThreadTitle(`${q?.customer?.nickname || "Cliente"} • ${q?.item?.title || itemId}`)

        try {
            const token = getAuthToken()
            const url =
                `${getApiBaseUrl()}/api/mercadolivre/questions/thread` +
                `?account_id=${encodeURIComponent(selectedAccount.id)}` +
                `&item_id=${encodeURIComponent(itemId)}` +
                `&from_id=${encodeURIComponent(fromId)}` +
                `&limit=30`
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data?.detail || data?.error || "Erro ao carregar histórico")
            setThreadQuestions(Array.isArray(data?.questions) ? data.questions : [])
        } catch (err: any) {
            alert(err?.message || "Erro ao carregar histórico")
        } finally {
            setThreadLoading(false)
        }
    }

    const handleAnswerQuestion = async (questionId: string) => {
        if (!answerText.trim()) return
        setLoading(true)
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/questions/answer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    account_id: selectedAccount.id,
                    question_id: questionId,
                    text: answerText
                })
            })
            if (!response.ok) throw new Error("Erro ao responder")
            alert("Resposta enviada!")
            setAnswering(null)
            setAnswerText("")
            fetchQuestions()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleConnect = async () => {
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/auth/url?system_user_id=${atendente?.id || ''}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await response.json()
            window.location.href = data.url
        } catch (err) {
            alert('Erro ao iniciar conexão')
        }
    }

    const handleDisconnect = async (acc: any) => {
        if (!confirm(`Tem certeza que deseja DESCONECTAR a conta "${acc.ml_nickname}"?\n\nIsso irá remover o acesso ao Mercado Livre mas NÃO excluirá os produtos já importados.`)) return
        try {
            await mercadolivreApi.deletar(acc.id)
            if (selectedAccount?.id === acc.id) setSelectedAccount(null)
            await fetchAccounts()
            alert(`Conta "${acc.ml_nickname}" desconectada com sucesso.`)
        } catch (err: any) {
            alert('Erro ao desconectar: ' + err.message)
        }
    }

    const handleSearchProduct = async () => {
        const q = searchProduct.trim()
        if (!q) {
            setFoundProducts([])
            return
        }
        const data = await estoqueApi.buscarProdutos({ q, limit: 10 })
        setFoundProducts(Array.isArray(data) ? data : [])
    }

    const handleLink = async (produtoId: string) => {
        try {
            const token = getAuthToken()
            await fetch(`${getApiBaseUrl()}/api/mercadolivre/links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    produto_id: produtoId,
                    ml_item_id: selectedMLItem.id,
                    ml_account_id: selectedAccount.id
                })
            })
            setIsLinkModalOpen(false)
            alert('Produto vinculado com sucesso!')
            fetchItems()
        } catch (err) {
            alert('Erro ao vincular')
        }
    }

    const handleImport = async (item: any) => {
        if (!confirm(`Deseja importar "${item.title}" como um novo produto no seu estoque?`)) return
        setLoading(true)
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ml_item_id: item.id,
                    account_id: selectedAccount.id
                })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Erro desconhecido')
            alert('Produto importado e vinculado com sucesso!')
            fetchItems()
        } catch (err: any) {
            alert('Erro ao importar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleBulkImport = async () => {
        if (selectedIds.length === 0) return
        if (!confirm(`Deseja importar os ${selectedIds.length} anúncios selecionados?`)) return

        setLoading(true)
        let success = 0
        let error = 0

        try {
            const token = getAuthToken()
            for (const id of selectedIds) {
                const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/import`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        ml_item_id: id,
                        account_id: selectedAccount.id
                    })
                })
                if (response.ok) success++
                else error++
            }
            alert(`${success} produtos importados com sucesso! ${error > 0 ? `${error} falharam.` : ''}`)
            setSelectedIds([])
            fetchItems()
        } catch (err) {
            alert('Erro durante a importação em lote')
        } finally {
            setLoading(false)
        }
    }

    const handleSyncAll = async () => {
        if (!selectedAccount) return
        if (!confirm(`Deseja sincronizar TODOS os produtos da conta "${selectedAccount.ml_nickname}"? Isso irá importar anúncios novos e atualizar vínculos existentes automaticamente.`)) return

        setLoading(true)
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/sync-all`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    account_id: selectedAccount.id
                })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Erro na sincronização')

            alert(`Sincronização concluída!\nTotal encontrados: ${data.total_found}\nProcessados: ${data.processed}\nFalhas: ${data.errors}`)
            fetchItems()
        } catch (err: any) {
            alert('Erro ao sincronizar tudo: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSyncOrders = async () => {
        if (!selectedAccount) return
        setLoading(true)
        try {
            const token = getAuthToken()
            const response = await fetch(`${getApiBaseUrl()}/api/mercadolivre/sync-orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    account_id: selectedAccount.id,
                    days: 30
                })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Erro ao sincronizar vendas')

            alert(`Vendas sincronizadas!\n${data.created} vendas criadas no CRM\n${data.skipped} já existiam\nTotal encontrado: ${data.total}`)
        } catch (err: any) {
            alert('Erro ao sincronizar vendas: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAccounts()
    }, [])

    useEffect(() => {
        if (selectedAccount) {
            fetchItems()
            fetchQuestions()
        }
    }, [selectedAccount, offset])

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black italic tracking-tighter flex items-center gap-2 text-[#FFE600] drop-shadow-sm">
                    <ShoppingBag className="w-8 h-8" /> MERCADO LIVRE
                </h1>
                <Button onClick={handleConnect} className="bg-[#FFE600] text-black hover:bg-[#FFE600]/90 font-bold shadow-lg">
                    Conectar Nova Conta
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="md:col-span-1 border-none shadow-xl bg-gradient-to-b from-card to-card/50">
                    <CardHeader>
                        <CardTitle className="text-sm uppercase font-black tracking-widest text-muted-foreground flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" /> Contas Conectadas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {accounts.map(acc => (
                            <div
                                key={acc.id}
                                onClick={() => { setSelectedAccount(acc); setOffset(0); }}
                                className={`p-4 rounded-xl border-2 transition-all duration-300 cursor-pointer ${selectedAccount?.id === acc.id ? 'border-[#FFE600] bg-[#FFE600]/10 shadow-[0_0_15px_rgba(255,230,0,0.2)] scale-105' : 'border-transparent bg-muted/30 hover:bg-muted opacity-70 hover:opacity-100 hover:scale-[1.02]'}`}
                            >
                                <div className="font-black text-lg">{acc.ml_nickname}</div>
                                <div className="text-xs font-bold text-muted-foreground uppercase mb-2">{acc.ml_site_id}</div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDisconnect(acc); }}
                                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-all mt-1 w-full"
                                    title="Desconectar conta"
                                >
                                    <LogOut className="w-3 h-3" /> Desconectar
                                </button>
                            </div>
                        ))}
                        {accounts.length === 0 && <p className="text-sm text-muted-foreground italic text-center p-4">Nenhuma conta conectada.</p>}
                    </CardContent>
                </Card>

                <div className="md:col-span-3 space-y-6">
                    <Tabs defaultValue="announcements" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-xl">
                            <TabsTrigger value="announcements" className="rounded-lg font-black italic tracking-tighter uppercase data-[state=active]:bg-[#FFE600] data-[state=active]:text-black">
                                <ShoppingBag className="w-4 h-4 mr-2" /> Anúncios ({totalItems})
                            </TabsTrigger>
                            <TabsTrigger value="messages" className="rounded-lg font-black italic tracking-tighter uppercase data-[state=active]:bg-[#FFE600] data-[state=active]:text-black relative">
                                <MessageSquare className="w-4 h-4 mr-2" /> Perguntas
                                {questions.length > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center animate-bounce border-2 border-background">{questions.length}</span>}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="announcements" className="mt-4">
                            <Card className="border-none shadow-2xl overflow-hidden bg-card/80 backdrop-blur-sm">
                                <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
                                    <div className="flex items-center gap-4">
                                        <CardTitle className="text-sm uppercase font-black tracking-widest text-muted-foreground flex items-center gap-2">
                                            <ShoppingBag className="w-4 h-4" /> Anúncios
                                        </CardTitle>
                                        {selectedIds.length > 0 && (
                                            <Button
                                                size="sm"
                                                onClick={handleBulkImport}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-7 py-0 px-3 animate-in fade-in slide-in-from-left-2 shadow-lg"
                                            >
                                                Importar Selecionados ({selectedIds.length})
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSyncOrders}
                                            disabled={loading || !selectedAccount}
                                            title="Trazer vendas do ML para o painel"
                                        >
                                            Sincronizar Vendas
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSyncAll}
                                            disabled={loading}
                                            className="hover:bg-blue-500/20 hover:text-blue-500 border-blue-500/30 font-bold"
                                        >
                                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Sincronizar Tudo (Auto)
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={fetchItems} disabled={loading} className="hover:bg-[#FFE600]/20 hover:text-[#FFE600]">
                                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar Lista
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow>
                                                    <TableHead className="w-[50px] pl-6 text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-input text-[#FFE600] focus:ring-[#FFE600] w-4 h-4 cursor-pointer"
                                                            checked={items.length > 0 && selectedIds.length === items.length}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setSelectedIds(items.map(i => i.id))
                                                                else setSelectedIds([])
                                                            }}
                                                        />
                                                    </TableHead>
                                                    <TableHead className="w-[80px]">Foto</TableHead>
                                                    <TableHead>Título</TableHead>
                                                    <TableHead>SKU do Anúncio</TableHead>
                                                    <TableHead className="text-center">Estoque</TableHead>
                                                    <TableHead>Preço</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right pr-6">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {items.map(item => (
                                                    <TableRow key={item.id} className="hover:bg-muted/20 transition-colors group">
                                                        <TableCell className="pl-6 text-center">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-input text-[#FFE600] focus:ring-[#FFE600] w-4 h-4 cursor-pointer"
                                                                checked={selectedIds.includes(item.id)}
                                                                onChange={() => {
                                                                    if (selectedIds.includes(item.id)) setSelectedIds(prev => prev.filter(id => id !== item.id))
                                                                    else setSelectedIds(prev => [...prev, item.id])
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="pl-4">
                                                            <div className="relative w-12 h-12">
                                                                <img src={item.thumbnail} className="w-full h-full object-cover rounded-lg border-2 border-muted group-hover:border-[#FFE600]/50 transition-colors" />
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="max-w-[250px] truncate font-bold text-sm" title={item.title}>
                                                            {item.title}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="font-mono text-[10px] tracking-tighter bg-muted/50 border-dashed">
                                                                {item.seller_sku || 'SEM SKU'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={`text-lg font-black ${item.available_quantity > 0 ? 'text-primary' : 'text-destructive'}`}>
                                                                {item.available_quantity}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="font-bold">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={item.status === 'active' ? 'default' : 'secondary'} className={item.status === 'active' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                                                                {item.status.toUpperCase()}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6">
                                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button variant="ghost" size="icon" onClick={() => { setSelectedMLItem(item); setIsLinkModalOpen(true); }} className="hover:bg-blue-500/20 hover:text-blue-500 w-8 h-8 rounded-full">
                                                                    <LinkIcon className="w-4 h-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" onClick={() => handleImport(item)} className="hover:bg-emerald-500/20 hover:text-emerald-500 w-8 h-8 rounded-full">
                                                                    <Plus className="w-4 h-4" />
                                                                </Button>
                                                                <a href={item.permalink} target="_blank" rel="noreferrer">
                                                                    <Button variant="ghost" size="icon" className="hover:bg-[#FFE600]/20 hover:text-[#FFE600] w-8 h-8 rounded-full">
                                                                        <ExternalLink className="w-4 h-4" />
                                                                    </Button>
                                                                </a>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                                {items.length === 0 && !loading && (
                                                    <TableRow>
                                                        <TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">
                                                            Nenhum anúncio encontrado para esta conta.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {/* Pagination */}
                                    <div className="p-4 bg-muted/10 border-t flex items-center justify-between">
                                        <p className="text-xs font-bold text-muted-foreground uppercase opacity-60">
                                            Exibindo {items.length} de {totalItems} anúncios
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={offset === 0 || loading}
                                                onClick={() => setOffset(Math.max(0, offset - limit))}
                                                className="rounded-lg h-8 px-2 font-bold"
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={offset + limit >= totalItems || loading}
                                                onClick={() => setOffset(offset + limit)}
                                                className="rounded-lg h-8 px-2 font-bold"
                                            >
                                                Próximo <ChevronRight className="w-4 h-4 ml-1" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="messages" className="mt-4">
                            <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-sm">
                                <CardHeader className="border-b bg-muted/20">
                                    <CardTitle className="text-xl font-black italic flex items-center gap-2">
                                        <MessageSquare className="w-5 h-5 text-[#FFE600]" /> PERGUNTAS PENDENTES
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 space-y-4">
                                    {questions.length === 0 ? (
                                        <div className="text-center py-20 bg-muted/10 rounded-2xl border-2 border-dashed border-muted">
                                            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                            <p className="text-muted-foreground font-medium italic">Tudo limpo! Nenhuma pergunta pendente no momento.</p>
                                        </div>
                                    ) : (
                                        questions.map(q => (
                                            <div key={q.id} className="p-5 rounded-2xl border-2 border-muted bg-background/50 hover:border-[#FFE600]/30 transition-all shadow-sm">
                                                <div className="flex flex-col sm:flex-row gap-4 mb-4 pb-4 border-b border-dashed border-muted">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <Badge className="bg-blue-600 hover:bg-blue-700 text-[10px] font-black uppercase">Novo</Badge>
                                                                <span className="text-xs text-muted-foreground font-mono">{new Date(q.date_created).toLocaleString('pt-BR')}</span>
                                                            </div>
                                                            <Badge variant="outline" className="text-[10px] font-bold text-primary">
                                                                {q.customer?.nickname}
                                                            </Badge>
                                                        </div>
                                                        <p className="font-bold text-lg leading-tight mb-2 select-all">"{q.text}"</p>
                                                    </div>

                                                    {q.item && (
                                                        <div className="flex items-start gap-3 p-2 bg-muted/30 rounded-xl border border-muted w-full sm:w-[250px] shrink-0">
                                                            <img src={q.item.thumbnail} className="w-12 h-12 object-cover rounded-lg border bg-white" alt="" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[10px] font-black uppercase text-muted-foreground mb-0.5">Anúncio</p>
                                                                <p className="text-xs font-bold leading-tight truncate" title={q.item.title}>{q.item.title}</p>
                                                                <a href={q.item.permalink} target="_blank" rel="noreferrer" className="text-[9px] text-[#FFE600] font-bold hover:underline flex items-center gap-1 mt-1">
                                                                    VER ITEM <ExternalLink className="w-2 h-2" />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {answering === q.id ? (
                                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div className="relative">
                                                            <Input
                                                                autoFocus
                                                                placeholder="Digite sua resposta aqui..."
                                                                value={answerText}
                                                                onChange={e => setAnswerText(e.target.value)}
                                                                className="bg-muted focus-visible:ring-[#FFE600] pr-10 rounded-xl font-medium"
                                                            />
                                                            <Send className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button size="sm" onClick={() => handleAnswerQuestion(q.id)} disabled={loading} className="bg-[#FFE600] text-black hover:bg-[#FFE600]/90 font-bold px-6 rounded-lg">
                                                                Enviar Resposta
                                                            </Button>
                                                            <Button size="sm" variant="ghost" onClick={() => { setAnswering(null); setAnswerText(""); }} className="font-bold rounded-lg">
                                                                Cancelar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={(e) => openThread(q, e)}
                                                            className="font-bold rounded-lg"
                                                        >
                                                            Ver histórico
                                                        </Button>
                                                        <Button size="sm" onClick={() => setAnswering(q.id)} className="bg-muted hover:bg-[#FFE600] text-foreground hover:text-black font-bold flex items-center gap-2 rounded-lg transition-colors group">
                                                            <Send className="w-3 h-3 group-hover:rotate-12 transition-transform" /> Responder Agora
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <Modal
                isOpen={isThreadOpen}
                onClose={() => { setIsThreadOpen(false); setThreadQuestions([]); setThreadTitle(""); }}
                title={threadTitle || "Histórico de mensagens"}
            >
                <div className="space-y-3">
                    {threadLoading ? (
                        <p className="text-sm text-muted-foreground italic">Carregando histórico…</p>
                    ) : threadQuestions.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Nenhuma mensagem anterior encontrada para este cliente neste anúncio.</p>
                    ) : (
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                            {threadQuestions.map((t: any) => (
                                <div key={String(t.id)} className="p-3 rounded-xl border bg-muted/20">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-mono text-muted-foreground">
                                            {t.date_created ? new Date(t.date_created).toLocaleString("pt-BR") : ""}
                                        </span>
                                        <Badge variant="outline" className="text-[10px] font-bold">
                                            {String(t.status || "").toUpperCase() || "—"}
                                        </Badge>
                                    </div>
                                    <p className="mt-2 font-semibold">Cliente:</p>
                                    <p className="text-sm select-all">"{t.text || ""}"</p>
                                    {t.answer?.text && (
                                        <>
                                            <p className="mt-3 font-semibold">Resposta:</p>
                                            <p className="text-sm select-all">"{t.answer.text}"</p>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Existing Modal - Minimal Update for Aesthetics */}
            <Modal
                isOpen={isLinkModalOpen}
                onClose={() => setIsLinkModalOpen(false)}
                title="Vincular Anúncio ao CRM"
            >
                <div className="space-y-6">
                    <div className="p-4 bg-muted/50 rounded-2xl flex gap-3 text-sm border-2 border-dashed border-[#FFE600]/20">
                        <AlertCircle className="w-6 h-6 text-[#FFE600]" />
                        <div>
                            <p className="font-black text-base italic leading-none">{selectedMLItem?.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 font-mono uppercase tracking-widest">{selectedMLItem?.id}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Buscar Produto no CRM</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Nome ou SKU..."
                                value={searchProduct}
                                onChange={e => setSearchProduct(e.target.value)}
                                className="bg-muted border-none focus-visible:ring-[#FFE600] rounded-xl font-bold"
                            />
                            <Button onClick={handleSearchProduct} className="bg-black text-white hover:bg-black/80 font-bold rounded-xl px-6">BUSCAR</Button>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {foundProducts.length > 0 ? (
                            foundProducts.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-4 border-2 border-muted rounded-2xl hover:border-[#FFE600]/50 hover:bg-[#FFE600]/5 transition-all group scale-100 active:scale-95">
                                    <div className="flex-1">
                                        <p className="font-black text-base italic leading-tight group-hover:text-primary transition-colors">{p.nome}</p>
                                        <div className="flex gap-2 mt-1">
                                            <Badge variant="outline" className="text-[10px] font-mono">{p.sku}</Badge>
                                            <Badge variant="secondary" className="text-[10px]">Stock: {p.estoque_atual}</Badge>
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={() => handleLink(p.id)} className="bg-black text-white hover:bg-black/90 font-bold rounded-xl px-4 ml-4">VINCULAR</Button>
                                </div>
                            ))
                        ) : searchProduct && (
                            <p className="text-center py-10 text-muted-foreground italic text-sm">Nenhum produto encontrado.</p>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    )
}
