import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
    CheckCircle2, Clock, Package, Truck, XCircle, ArrowLeft, MapPin,
    FileText, AlertCircle, Loader2, User, Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getApiBaseUrl } from '@/lib/apiBase'
import { STORE_NAVY, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme'
import { ManualPixPayment } from '../components/ManualPixPayment'
import { MercadoPagoPixPayment } from '../components/MercadoPagoPixPayment'

interface Order {
    id: string
    order_number: number
    status: string
    payment_status: string
    payment_method: string
    payment_provider?: 'manual' | 'mercadopago'
    delivery_method: string
    total: number
    customer_name: string
    customer_phone: string
    customer_email?: string
    customer_zipcode?: string
    customer_address?: string
    customer_number?: string
    customer_complement?: string
    customer_neighborhood?: string
    customer_city?: string
    customer_state?: string
    pix_payload_emv?: string
    pix_chave_usada?: string
    mp_pix_qr_code_base64?: string
    mp_pix_copy_paste?: string
    mp_pix_expiration?: string
    comprovante_url?: string
    boleto_status?: string
    boleto_pdf_url?: string
    boleto_linha_digitavel?: string
    boleto_vencimento?: string
    boleto_recusado_motivo?: string
    cancelado_motivo?: string
    created_at: string
    updated_at: string
    items: Array<{ id: string; name_snapshot: string; quantity: number; price_snapshot: number }>
    history: Array<{ evento: string; descricao?: string; created_at: string; atendente_nome?: string }>
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (s?: string) => s ? new Date(s).toLocaleString('pt-BR') : ''

function paymentStatusLabel(ps: string): { label: string; color: string } {
    switch (ps) {
        case 'aguardando_comprovante': return { label: 'Aguardando pagamento', color: 'bg-amber-100 text-amber-800' }
        case 'comprovante_enviado': return { label: 'Comprovante em análise', color: 'bg-blue-100 text-blue-800' }
        case 'approved': return { label: 'Pagamento confirmado', color: 'bg-emerald-100 text-emerald-800' }
        case 'pago_presencial': return { label: 'Pago na retirada', color: 'bg-emerald-100 text-emerald-800' }
        case 'rejected': return { label: 'Pagamento recusado', color: 'bg-rose-100 text-rose-800' }
        case 'aguardando_liberacao': return { label: 'Boleto em análise', color: 'bg-amber-100 text-amber-800' }
        case 'pending':
        default: return { label: 'Aguardando', color: 'bg-slate-100 text-slate-700' }
    }
}

function entregaStatusLabel(s: string): { label: string; icon: any; color: string } {
    switch (s) {
        case 'em_preparo': return { label: 'Em preparo', icon: Package, color: 'text-blue-600' }
        case 'pronto_retirada': return { label: 'Pronto para retirada', icon: CheckCircle2, color: 'text-emerald-600' }
        case 'em_rota': return { label: 'Em rota', icon: Truck, color: 'text-blue-600' }
        case 'delivered': return { label: 'Entregue', icon: CheckCircle2, color: 'text-emerald-600' }
        case 'canceled': return { label: 'Cancelado', icon: XCircle, color: 'text-rose-600' }
        case 'aguardando_pagamento':
        case 'pending':
        default: return { label: 'Aguardando pagamento', icon: Clock, color: 'text-slate-500' }
    }
}

export function OrderStatusManualPage() {
    const { id } = useParams<{ id: string }>()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    const [order, setOrder] = useState<Order | null>(null)
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState<string | null>(null)
    const [pixCfg, setPixCfg] = useState<{ ativo: boolean; nome_beneficiario?: string; instrucoes?: string }>({ ativo: false })

    const fetchOrder = async () => {
        if (!id) return
        if (!token) {
            setErr('Link inválido: falta o token do pedido')
            setLoading(false)
            return
        }
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/orders/${id}?token=${encodeURIComponent(token)}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data?.detail || 'Pedido não encontrado')
            setOrder({ ...data.order, items: data.items || [] })
        } catch (e: any) {
            setErr(e?.message || 'Erro ao carregar pedido')
        } finally { setLoading(false) }
    }

    useEffect(() => { fetchOrder() }, [id, token])

    useEffect(() => {
        fetch(`${getApiBaseUrl()}/api/store/checkout/config/pix`).then(r => r.json()).then(setPixCfg).catch(() => { })
    }, [])

    // PIX/cartão do Mercado Pago confirmam em segundos — poll mais rápido nesse caso.
    // Fluxo manual (comprovante revisado por atendente) mantém 30s.
    useEffect(() => {
        if (!id || !order || order.payment_status === 'approved' || order.payment_status === 'rejected') return
        const intervalMs = order.payment_provider === 'mercadopago' ? 8000 : 30000
        const t = setInterval(fetchOrder, intervalMs)
        return () => clearInterval(t)
    }, [id, order?.payment_provider, order?.payment_status])

    if (loading) return (
        <div className={`min-h-screen flex items-center justify-center ${STORE_PUBLIC_SCOPE_CLASS}`}>
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
    )

    if (err || !order) return (
        <div className={`min-h-screen flex items-center justify-center ${STORE_PUBLIC_SCOPE_CLASS} p-4`}>
            <Card className="max-w-md w-full">
                <CardContent className="pt-6 text-center space-y-3">
                    <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
                    <h2 className="font-bold text-lg">Pedido não encontrado</h2>
                    <p className="text-sm text-slate-500">{err}</p>
                    <Link to="/"><Button>Voltar à loja</Button></Link>
                </CardContent>
            </Card>
        </div>
    )

    const pagStatus = paymentStatusLabel(order.payment_status)
    const entStatus = entregaStatusLabel(order.status)
    const EntIco = entStatus.icon

    const podeEnviarComprovante = (
        ['pix', 'transferencia'].includes(order.payment_method) &&
        !order.comprovante_url &&
        order.payment_status !== 'approved' &&
        order.payment_status !== 'rejected'
    )

    return (
        <div className={`min-h-screen bg-gray-50 pb-20 ${STORE_PUBLIC_SCOPE_CLASS}`}>
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
                    <h1 className="font-bold text-lg">Pedido #{order.order_number}</h1>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

                {/* Status */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                                <EntIco className={`w-7 h-7 ${entStatus.color}`} />
                                <div>
                                    <p className="font-bold">{entStatus.label}</p>
                                    <p className="text-xs text-slate-500">Atualizado em {fmtDate(order.updated_at)}</p>
                                </div>
                            </div>
                            <Badge className={pagStatus.color}>{pagStatus.label}</Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Cancelado */}
                {order.status === 'canceled' && order.cancelado_motivo && (
                    <Card className="border-rose-200 bg-rose-50">
                        <CardContent className="pt-6 flex items-start gap-2">
                            <XCircle className="w-5 h-5 text-rose-600 mt-0.5" />
                            <div>
                                <p className="font-bold text-rose-800">Pedido cancelado</p>
                                <p className="text-sm text-rose-700">{order.cancelado_motivo}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* PIX via Mercado Pago (gateway) — confirmação automática pelo webhook */}
                {order.payment_provider === 'mercadopago' && order.payment_method === 'pix' && order.payment_status === 'pending' && (
                    <MercadoPagoPixPayment
                        qrCodeBase64={order.mp_pix_qr_code_base64}
                        copyPaste={order.mp_pix_copy_paste}
                        expirationDate={order.mp_pix_expiration}
                        total={Number(order.total)}
                    />
                )}

                {/* PIX manual (chave própria da loja) — cliente envia comprovante */}
                {order.payment_provider !== 'mercadopago' && order.payment_method === 'pix' && order.pix_payload_emv && order.payment_status !== 'approved' && order.payment_status !== 'rejected' && (
                    <ManualPixPayment
                        orderId={order.id}
                        token={token || ''}
                        pixPayload={order.pix_payload_emv}
                        total={Number(order.total)}
                        beneficiarioNome={pixCfg.nome_beneficiario}
                        instrucoes={pixCfg.instrucoes}
                        comprovanteEnviado={!!order.comprovante_url || order.payment_status === 'comprovante_enviado'}
                    />
                )}

                {/* Transferência: só upload de comprovante */}
                {order.payment_method === 'transferencia' && podeEnviarComprovante && (
                    <Card>
                        <CardHeader><CardTitle>Pagamento por transferência</CardTitle></CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <p>Faça a transferência usando os dados informados pela loja (WhatsApp) e envie o comprovante:</p>
                            <ManualPixPayment
                                orderId={order.id}
                                token={token || ''}
                                pixPayload=""   // não exibe QR; só usa o uploader interno
                                total={Number(order.total)}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* Boleto liberado */}
                {order.payment_method === 'boleto' && order.boleto_status === 'liberado' && order.boleto_pdf_url && (
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Boleto disponível</CardTitle></CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <a href={order.boleto_pdf_url} target="_blank" rel="noopener noreferrer">
                                <Button className="gap-2"><FileText className="w-4 h-4" /> Baixar boleto (PDF)</Button>
                            </a>
                            {order.boleto_linha_digitavel && (
                                <div className="bg-slate-50 p-2 rounded text-xs font-mono break-all">{order.boleto_linha_digitavel}</div>
                            )}
                            {order.boleto_vencimento && (
                                <p>Vencimento: <strong>{new Date(order.boleto_vencimento).toLocaleDateString('pt-BR')}</strong></p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Boleto aguardando */}
                {order.payment_method === 'boleto' && order.boleto_status === 'aguardando_liberacao' && (
                    <Card className="border-amber-200 bg-amber-50">
                        <CardContent className="pt-6 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                            <div>
                                <p className="font-bold text-amber-800">Boleto em análise</p>
                                <p className="text-sm text-amber-700">Estamos avaliando seu pedido. Avisaremos pelo WhatsApp quando o boleto for liberado.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Itens */}
                <Card>
                    <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {order.items.map(it => (
                            <div key={it.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                                <div>
                                    <p className="font-medium">{it.name_snapshot}</p>
                                    <p className="text-xs text-slate-500">{it.quantity}× {fmtBRL(it.price_snapshot)}</p>
                                </div>
                                <p className="font-bold">{fmtBRL(it.quantity * it.price_snapshot)}</p>
                            </div>
                        ))}
                        <div className="flex justify-between font-bold text-base pt-2">
                            <span>Total</span><span>{fmtBRL(order.total)}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Contato + endereço */}
                <Card>
                    <CardHeader><CardTitle>Dados de contato</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <p className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /> {order.customer_name}</p>
                        <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {order.customer_phone}</p>
                        {order.customer_email && <p>✉ {order.customer_email}</p>}
                        {order.delivery_method === 'ENTREGA' && order.customer_address && (
                            <div className="flex items-start gap-2 pt-2 border-t mt-2">
                                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                                <p>
                                    {order.customer_address}, {order.customer_number}
                                    {order.customer_complement && ` — ${order.customer_complement}`}
                                    <br />
                                    {order.customer_neighborhood}, {order.customer_city}/{order.customer_state}
                                    {order.customer_zipcode && ` — ${order.customer_zipcode}`}
                                </p>
                            </div>
                        )}
                        {order.delivery_method === 'RETIRADA' && (
                            <p className="pt-2 text-emerald-700 font-medium">📦 Retirada na loja</p>
                        )}
                    </CardContent>
                </Card>

                {/* Histórico */}
                {order.history && order.history.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            {order.history.map((h, i) => (
                                <div key={i} className="flex gap-2 text-xs">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                    <div className="flex-1">
                                        <p className="font-medium">{h.descricao || h.evento}</p>
                                        <p className="text-slate-500">{fmtDate(h.created_at)} {h.atendente_nome ? `• ${h.atendente_nome}` : ''}</p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
