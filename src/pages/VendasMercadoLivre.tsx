import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
    ShoppingCart, 
    MessageSquare, 
    RefreshCw, 
    Send, 
    ExternalLink, 
    User,
    Package,
    Clock,
    CheckCircle,
    AlertCircle,
    ChevronLeft,
    ChevronRight
} from "lucide-react"
import { mercadoLivreApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"

interface MLVenda {
    id: string
    date_created: string
    total_amount: number
    status: string
    buyer: {
        id: string
        nickname: string
        first_name: string
        last_name: string
        email?: string
        phone?: {
            area_code: string
            number: string
        }
    }
    order_items: Array<{
        id: string
        title: string
        quantity: number
        unit_price: number
    }>
    payments: Array<{
        payment_type: string
        status: string
    }>
    shipping: {
        id: string
        status: string
    }
    pack_id: string
    local_venda_id?: string
    local_status?: string
    cliente_info?: {
        id: string
        nome: string
        email: string
        telefone: string
    }
}

interface Message {
    id: string
    from: { user_id: string }
    to: { user_id: string }
    text: string
    message_date: {
        received: string
        created: string
        read?: string
    }
    status: string
    is_from_seller: boolean
    is_from_buyer: boolean
}

export function VendasMercadoLivre() {
    const [accounts, setAccounts] = useState<any[]>([])
    const [selectedAccount, setSelectedAccount] = useState<any>(null)
    const [vendas, setVendas] = useState<MLVenda[]>([])
    const [totalVendas, setTotalVendas] = useState(0)
    const [offset, setOffset] = useState(0)
    const limit = 20

    const [selectedVenda, setSelectedVenda] = useState<MLVenda | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [newMessage, setNewMessage] = useState("")
    const [sendingMessage, setSendingMessage] = useState(false)
    const [loadingMessages, setLoadingMessages] = useState(false)

    const [loading, setLoading] = useState(false)
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const [statusFilter, setStatusFilter] = useState('paid')
    const [syncing, setSyncing] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const { atendente } = useAuthStore()

    const fetchAccounts = async () => {
        try {
            const data = await mercadoLivreApi.listarContas()
            setAccounts(data || [])
            if (data && data.length > 0 && !selectedAccount) {
                setSelectedAccount(data[0])
            }
        } catch (err) {
            console.error('Erro ao buscar contas ML:', err)
        }
    }

    const fetchVendas = async () => {
        if (!selectedAccount) return
        setLoading(true)
        try {
            const data = await mercadoLivreApi.listarVendas({
                account_id: selectedAccount.id,
                status: statusFilter,
                limit,
                offset
            })
            setVendas(data.orders || [])
            setTotalVendas(data.paging?.total || 0)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const sincronizarVendas = async () => {
        if (!selectedAccount) return
        setSyncing(true)
        try {
            await mercadoLivreApi.sincronizarVendas(selectedAccount.id, 30)
            alert('Vendas sincronizadas com sucesso!')
            fetchVendas() // Atualizar lista após sincronização
            fetchUnreadCount()
        } catch (err: any) {
            console.error(err)
            alert('Erro ao sincronizar vendas: ' + (err.error || err.message))
        } finally {
            setSyncing(false)
        }
    }

    const fetchUnreadCount = async () => {
        if (!selectedAccount) return
        try {
            const data = await mercadoLivreApi.mensagensNaoLidas(selectedAccount.id)
            setUnreadCount(data.results?.length || 0)
        } catch (err) {
            console.error('Erro ao buscar contador de não lidas:', err)
        }
    }

    const openChat = async (venda: MLVenda) => {
        setSelectedVenda(venda)
        setIsChatOpen(true)
        setLoadingMessages(true)
        setMessages([])
        
        try {
            const data = await mercadoLivreApi.buscarMensagens(venda.id, {
                account_id: selectedAccount.id,
                mark_as_read: true
            })
            // Ordenar mensagens: mais antiga primeiro (em cima), mais recente por último (embaixo)
            const sortedMessages = (data.messages || []).sort((a: any, b: any) => {
                const dateA = new Date(a.message_date?.created || 0).getTime()
                const dateB = new Date(b.message_date?.created || 0).getTime()
                return dateA - dateB
            })
            setMessages(sortedMessages)
        } catch (err) {
            console.error('Erro ao buscar mensagens:', err)
        } finally {
            setLoadingMessages(false)
        }
    }

    const sendMessage = async () => {
        if (!selectedVenda || !newMessage.trim() || sendingMessage) return

        setSendingMessage(true)
        try {
            await mercadoLivreApi.enviarMensagem(selectedVenda.id, {
                account_id: selectedAccount.id,
                text: newMessage.trim()
            })

            // Adicionar mensagem localmente
            const formatBuyerName = (buyer: any) => {
                // Usar o campo 'name' já processado pelo backend
                if (buyer.name) {
                    return buyer.name
                }
                // Fallback para compatibilidade
                if (buyer.first_name && buyer.last_name) {
                    return `${buyer.first_name} ${buyer.last_name}`
                }
                return buyer.first_name || buyer.nickname || 'Nome não disponível'
            }
            const tempMessage: Message = {
                id: `temp-${Date.now()}`,
                from: { user_id: selectedAccount.ml_user_id },
                to: { user_id: selectedVenda.buyer.id },
                text: newMessage.trim(),
                message_date: {
                    received: new Date().toISOString(),
                    created: new Date().toISOString()
                },
                status: 'available',
                is_from_seller: true,
                is_from_buyer: false
            }

            setMessages(prev => [...prev, tempMessage])
            setNewMessage("")
            
            // Scroll para o final
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
            }, 100)
        } catch (err: any) {
            console.error('Erro ao enviar mensagem:', err)
            alert(err.error || 'Erro ao enviar mensagem')
        } finally {
            setSendingMessage(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value)
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('pt-BR')
    }

    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
            paid: { label: "Pago", variant: "default" },
            confirmed: { label: "Confirmado", variant: "default" },
            payment_required: { label: "Aguardando Pagamento", variant: "secondary" },
            cancelled: { label: "Cancelado", variant: "destructive" }
        }
        
        const config = statusMap[status] || { label: status, variant: "secondary" }
        return <Badge variant={config.variant}>{config.label}</Badge>
    }

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    useEffect(() => {
        fetchAccounts()
    }, [])

    useEffect(() => {
        if (selectedAccount) {
            fetchVendas()
            fetchUnreadCount()
        }
    }, [selectedAccount, offset, statusFilter])

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Vendas Mercado Livre</h1>
                    <p className="text-muted-foreground">
                        Gerencie as vendas e converse com os clientes do Mercado Livre
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            {unreadCount} não lidas
                        </Badge>
                    )}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border rounded-md"
                    >
                        <option value="paid">Pagas</option>
                        <option value="confirmed">Confirmadas</option>
                        <option value="all">Todas</option>
                    </select>
                    <Button onClick={fetchVendas} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button onClick={sincronizarVendas} disabled={syncing} variant="outline">
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                        Sincronizar
                    </Button>
                </div>
            </div>

            {/* Seletor de Conta */}
            {accounts.length > 1 && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <label className="font-medium">Conta ML:</label>
                            <select
                                value={selectedAccount?.id || ''}
                                onChange={(e) => setSelectedAccount(accounts.find(a => a.id === e.target.value))}
                                className="px-3 py-2 border rounded-md"
                            >
                                {accounts.map(account => (
                                    <option key={account.id} value={account.id}>
                                        {account.ml_nickname}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lista de Vendas */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5" />
                        Vendas Recentes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Produtos</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {vendas.map((venda) => (
                                <TableRow key={venda.id}>
                                    <TableCell>
                                        <div className="text-sm">
                                            {formatDate(venda.date_created)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4" />
                                            <div>
                                                <div className="font-medium">
                                                    {venda.buyer.nickname}
                                                </div>
                                                {venda.cliente_info && (
                                                    <div className="text-sm text-muted-foreground">
                                                        {venda.cliente_info.nome}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="max-w-xs">
                                            {venda.order_items.slice(0, 2).map((item, idx) => (
                                                <div key={idx} className="text-sm truncate">
                                                    {item.quantity}x {item.title}
                                                </div>
                                            ))}
                                            {venda.order_items.length > 2 && (
                                                <div className="text-sm text-muted-foreground">
                                                    +{venda.order_items.length - 2} itens
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {formatCurrency(venda.total_amount)}
                                    </TableCell>
                                    <TableCell>
                                        {getStatusBadge(venda.status)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => openChat(venda)}
                                            >
                                                <MessageSquare className="w-4 h-4 mr-1" />
                                                Chat
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => window.open(`https://www.mercadolivre.com.br/vendas/${venda.id}`, '_blank')}
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Paginação */}
                    {totalVendas > limit && (
                        <div className="flex items-center justify-between mt-4">
                            <div className="text-sm text-muted-foreground">
                                Mostrando {offset + 1} a {Math.min(offset + limit, totalVendas)} de {totalVendas} vendas
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOffset(Math.max(0, offset - limit))}
                                    disabled={offset === 0}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOffset(offset + limit)}
                                    disabled={offset + limit >= totalVendas}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modal de Chat */}
            <Modal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} title="Chat com Cliente">
                {selectedVenda && (
                    <div className="w-full max-w-5xl">
                        {/* Cabeçalho da Venda */}
                        <div className="border-b pb-4 mb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-lg">
                                        Venda #{selectedVenda.id}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Cliente: {selectedVenda.buyer.nickname}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Total: {formatCurrency(selectedVenda.total_amount)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {getStatusBadge(selectedVenda.status)}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => window.open(`https://www.mercadolivre.com.br/vendas/${selectedVenda.id}`, '_blank')}
                                    >
                                        <ExternalLink className="w-4 h-4 mr-1" />
                                        Ver no ML
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Área de Mensagens */}
                        <div className="space-y-4">
                            <div className="h-[550px] border rounded-lg p-4 overflow-y-auto">
                                {loadingMessages ? (
                                    <div className="flex items-center justify-center h-32">
                                        <RefreshCw className="w-6 h-6 animate-spin" />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                                        Nenhuma mensagem nesta conversa
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {messages.map((message) => (
                                            <div
                                                key={message.id}
                                                className={`flex ${message.is_from_seller ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                                        message.is_from_seller
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted'
                                                    }`}
                                                >
                                                    <p className="text-sm">{message.text}</p>
                                                    <p className="text-xs opacity-70 mt-1">
                                                        {formatDate(message.message_date.created)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>
                                )}
                            </div>

                            {/* Input de Mensagem */}
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Digite sua mensagem..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                    maxLength={350}
                                    disabled={sendingMessage}
                                />
                                <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()}>
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {newMessage.length}/350 caracteres
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    )
}
