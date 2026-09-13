import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
    ShoppingCart, ArrowLeft, Trash2, Plus, Minus,
    CheckCircle2, AlertCircle, Loader2, Store, Truck,
    QrCode, CreditCard, Banknote, FileText, ArrowRightLeft,
    User, Phone, Mail, IdCard, MapPin
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCart } from '../hooks/useCart'
import { useStoreAuth } from '../contexts/StoreAuthContext'
import { StoreLoginModal } from '../components/StoreLoginModal'
import { ManualPixPayment } from '../components/ManualPixPayment'
import { STORE_NAVY, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme'
import { getApiBaseUrl } from '@/lib/apiBase'

type FormaPagamento = 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro' | 'transferencia' | 'boleto'
type ModoEntrega = 'retirada' | 'entrega'

const FORMAS: { value: FormaPagamento; label: string; icon: any; descricao: string; presencial?: boolean; precisaComprovante?: boolean; precisaLiberacao?: boolean }[] = [
    { value: 'pix', label: 'PIX', icon: QrCode, descricao: 'Pague pelo QR Code e envie o comprovante.' },
    { value: 'transferencia', label: 'Transferência', icon: ArrowRightLeft, descricao: 'Transferência bancária. Envie comprovante.', precisaComprovante: true },
    { value: 'cartao_credito', label: 'Cartão de Crédito', icon: CreditCard, descricao: 'Pagamento na entrega/retirada.', presencial: true },
    { value: 'cartao_debito', label: 'Cartão de Débito', icon: CreditCard, descricao: 'Pagamento na entrega/retirada.', presencial: true },
    { value: 'dinheiro', label: 'Dinheiro', icon: Banknote, descricao: 'Pagamento na entrega/retirada.', presencial: true },
    { value: 'boleto', label: 'Boleto', icon: FileText, descricao: 'Sujeito à análise. Você preencherá seus dados completos.', precisaLiberacao: true },
]

interface FinishedOrder {
    id: string
    order_number: number
    public_token?: string | null
    payment_method: FormaPagamento
    payment_status: string
    boleto_status?: string | null
    total: number
    pix_payload_emv?: string | null
    pix_chave_usada?: string | null
}

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

export function CheckoutManualPage() {
    const navigate = useNavigate()
    const { items, clearCart, total: cartTotal, updateQuantity, removeItem } = useCart()
    const { customer } = useStoreAuth()

    const [loginModalOpen, setLoginModalOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [finishedOrder, setFinishedOrder] = useState<FinishedOrder | null>(null)
    const [pixConfig, setPixConfig] = useState<{ ativo: boolean; nome_beneficiario?: string; instrucoes?: string; chave_pix?: string }>({ ativo: false })

    // Dados do cliente
    const [nome, setNome] = useState('')
    const [telefone, setTelefone] = useState('')
    const [email, setEmail] = useState('')
    const [cpf, setCpf] = useState('')

    // Modo de entrega + endereço
    const [modoEntrega, setModoEntrega] = useState<ModoEntrega>('retirada')
    const [cep, setCep] = useState('')
    const [logradouro, setLogradouro] = useState('')
    const [numero, setNumero] = useState('')
    const [complemento, setComplemento] = useState('')
    const [bairro, setBairro] = useState('')
    const [cidade, setCidade] = useState('')
    const [uf, setUf] = useState('')
    const [referencia, setReferencia] = useState('')
    const [recebedorNome, setRecebedorNome] = useState('')
    const [recebedorTelefone, setRecebedorTelefone] = useState('')
    const [buscandoCep, setBuscandoCep] = useState(false)

    // Pagamento
    const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('pix')
    const [observacoes, setObservacoes] = useState('')

    // Preenche dados quando o cliente está logado
    useEffect(() => {
        if (customer) {
            setNome(customer.name || '')
            setTelefone(customer.phone || '')
            setEmail(customer.email || '')
            setCpf((customer as any).cpf || '')
        }
    }, [customer])

    // Carrega config PIX (pra mostrar nome do beneficiário)
    useEffect(() => {
        fetch(`${getApiBaseUrl()}/api/store/checkout/config/pix`)
            .then(r => r.json())
            .then(setPixConfig)
            .catch(() => { /* ignore */ })
    }, [])

    useEffect(() => {
        const cartRaw = localStorage.getItem('dourados_store_cart')
        const parsed = cartRaw ? JSON.parse(cartRaw) : []
        if (parsed.length === 0) {
            localStorage.setItem('dourados_store_cart', JSON.stringify([{
                product_id: "e4444555-5555-5555-5555-555555555555",
                slug: "parachoque-dianteiro-virtus-2023",
                nome: "PARACHOQUE DIANTEIRO ORIGINAL VIRTUS 2023",
                sku: "DEMO-001",
                public_price: 749.90,
                imagem_url: null,
                quantity: 1,
            }]))
            window.location.reload()
        }
    }, [])


    // Carrinho vazio → volta pra loja
    useEffect(() => {
        if (items.length === 0 && !finishedOrder) {
            const t = setTimeout(() => navigate('/'), 100)
            return () => clearTimeout(t)
        }
    }, [items.length, finishedOrder, navigate])

    // CEP auto-fill via ViaCEP
    const buscarCep = async (cepStr: string) => {
        const numCep = cepStr.replace(/\D/g, '')
        if (numCep.length !== 8) return
        setBuscandoCep(true)
        try {
            const r = await fetch(`https://viacep.com.br/ws/${numCep}/json/`)
            const d = await r.json()
            if (d.erro) return
            setLogradouro(d.logradouro || '')
            setBairro(d.bairro || '')
            setCidade(d.localidade || '')
            setUf(d.uf || '')
        } catch { /* ignore */ } finally { setBuscandoCep(false) }
    }

    const formaSel = FORMAS.find(f => f.value === formaPagamento)!
    const precisaEndereco = modoEntrega === 'entrega' || formaPagamento === 'boleto'
    const precisaCpf = true

    const validarForm = (): string | null => {
        if (items.length === 0) return 'Seu carrinho está vazio'
        if (!nome.trim()) return 'Informe seu nome'
        if (!telefone.trim()) return 'Informe seu telefone'
        if (precisaCpf && !cpf.trim()) return 'CPF/CNPJ é obrigatório para vincular o pedido à sua conta'
        if (precisaEndereco) {
            if (!cep.trim() || !logradouro.trim() || !numero.trim() || !bairro.trim() || !cidade.trim() || !uf.trim()) {
                return 'Preencha o endereço completo'
            }
            if (modoEntrega === 'entrega' && !recebedorNome.trim()) {
                return 'Informe o nome de quem vai receber'
            }
        }
        return null
    }

    const submit = async () => {
        const err = validarForm()
        if (err) { toast.error(err); return }

        setSubmitting(true)
        try {
            const payload = {
                items: items.map(it => ({ product_id: it.product_id, quantity: it.quantity })),
                forma_pagamento: formaPagamento,
                modo_entrega: modoEntrega,
                customer_id: customer?.id || null,
                customer_name: nome.trim(),
                customer_phone: telefone.trim(),
                customer_email: email || null,
                customer_cpf: cpf || null,
                end_cep: precisaEndereco ? cep : null,
                end_logradouro: precisaEndereco ? logradouro : null,
                end_numero: precisaEndereco ? numero : null,
                end_complemento: precisaEndereco ? complemento : null,
                end_bairro: precisaEndereco ? bairro : null,
                end_cidade: precisaEndereco ? cidade : null,
                end_uf: precisaEndereco ? uf : null,
                end_referencia: precisaEndereco ? referencia : null,
                recebedor_nome: modoEntrega === 'entrega' ? recebedorNome : null,
                recebedor_telefone: modoEntrega === 'entrega' ? recebedorTelefone : null,
                observacoes: observacoes || null,
            }
            const res = await fetch(`${getApiBaseUrl()}/api/store/checkout/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.detail || 'Falha ao criar pedido')
            setFinishedOrder({
                id: data.id,
                order_number: data.order_number,
                payment_method: data.payment_method,
                payment_status: data.payment_status,
                boleto_status: data.boleto_status,
                total: Number(data.total || 0),
                pix_payload_emv: data.pix_payload_emv,
                pix_chave_usada: data.pix_chave_usada,
            })
            clearCart()
        } catch (e: any) {
            toast.error(e?.message || 'Erro ao processar pedido')
        } finally { setSubmitting(false) }
    }

    // ─── Tela de confirmação após criar pedido ──────────────────────────────
    // ─── Tela de confirmação após criar pedido ──────────────────────────────
    if (finishedOrder) {
        return (
            <div className={`min-h-screen bg-[#F4F7F9] ${STORE_PUBLIC_SCOPE_CLASS} py-12 px-4`}>
                <div className="max-w-2xl mx-auto space-y-6">
                    <Card className="border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)] overflow-hidden">
                        <div className="h-2 bg-[#B6D433]" />
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-3 text-2xl font-black italic uppercase tracking-tight text-[#001A54]">
                                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                                Pedido #{finishedOrder.order_number} Criado!
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-slate-700 pt-2">
                            <p className="text-sm font-medium">Parabéns! Seu pedido foi registrado com sucesso em nosso sistema.</p>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 mt-4">
                                <div className="flex justify-between text-sm"><span>Total do Pedido:</span><strong className="text-[#001A54] text-lg font-black">{fmtBRL(finishedOrder.total)}</strong></div>
                                <div className="flex justify-between text-sm"><span>Forma de Pagamento:</span><strong className="text-[#001A54] font-bold">{FORMAS.find(f => f.value === finishedOrder.payment_method)?.label}</strong></div>
                            </div>
                        </CardContent>
                    </Card>

                    {finishedOrder.payment_method === 'pix' && finishedOrder.pix_payload_emv && (
                        <ManualPixPayment
                            orderId={finishedOrder.id}
                            token={finishedOrder.public_token || ''}
                            pixPayload={finishedOrder.pix_payload_emv}
                            total={finishedOrder.total}
                            beneficiarioNome={pixConfig.nome_beneficiario}
                            instrucoes={pixConfig.instrucoes}
                        />
                    )}

                    {finishedOrder.payment_method === 'transferencia' && (
                        <Card className="border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)]">
                            <CardHeader><CardTitle className="text-lg font-black italic uppercase tracking-tight text-[#001A54]">Pagamento via Transferência</CardTitle></CardHeader>
                            <CardContent className="space-y-4 text-sm text-slate-600">
                                <p className="leading-relaxed">Faça a transferência para os dados informados pela loja e envie o comprovante em seguida pelo WhatsApp ou na tela de acompanhamento do pedido.</p>
                                <Link to={`/pedido/${finishedOrder.id}`}>
                                    <Button className="w-full h-11 rounded-xl bg-[#001A54] hover:bg-[#B6D433] hover:text-[#001A54] text-white font-bold transition-all shadow-md">Ir para acompanhamento do pedido</Button>
                                </Link>
                            </CardContent>
                        </Card>
                    )}

                    {(finishedOrder.payment_method === 'cartao_credito' || finishedOrder.payment_method === 'cartao_debito' || finishedOrder.payment_method === 'dinheiro') && (
                        <Card className="border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.02)]">
                            <CardHeader><CardTitle className="text-lg font-black italic uppercase tracking-tight text-[#001A54]">Pagamento na entrega/retirada</CardTitle></CardHeader>
                            <CardContent className="space-y-4 text-sm text-slate-600">
                                <p className="leading-relaxed">Seu pedido foi recebido. <strong>Pague no momento da retirada ou da entrega</strong>. A equipe da Dourados Auto Peças já está preparando suas peças e te avisará por WhatsApp assim que estiver pronto.</p>
                                <Link to={`/pedido/${finishedOrder.id}`}>
                                    <Button className="w-full h-11 rounded-xl bg-[#001A54] hover:bg-[#B6D433] hover:text-[#001A54] text-white font-bold transition-all shadow-md">Acompanhar pedido</Button>
                                </Link>
                            </CardContent>
                        </Card>
                    )}

                    {finishedOrder.payment_method === 'boleto' && (
                        <Card className="border-amber-200 bg-amber-50/50 shadow-[0_10px_30px_rgba(0,0,0,0.02)]">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-amber-800 text-lg font-black italic uppercase tracking-tight">
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                    Boleto aguardando liberação
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm text-slate-700">
                                <p className="leading-relaxed">Seu pedido está em análise de crédito para liberação do faturamento via boleto. Após a aprovação rápida, enviaremos o boleto em formato PDF para o seu WhatsApp cadastrado.</p>
                                <p className="font-bold">Acompanhe o status na página do seu pedido:</p>
                                <Link to={`/pedido/${finishedOrder.id}`}>
                                    <Button variant="outline" className="w-full h-11 rounded-xl border-amber-200 bg-white text-amber-800 hover:bg-amber-100 transition-all font-bold">Acompanhar pedido</Button>
                                </Link>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        )
    }

    // ─── Carrinho vazio (transient) ─────────────────────────────────────────
    if (items.length === 0) {
        return (
            <div className={`min-h-screen ${STORE_PUBLIC_SCOPE_CLASS} flex items-center justify-center`}>
                <Loader2 className="w-6 h-6 animate-spin text-[#001A54]" />
            </div>
        )
    }

    // ─── Form de checkout ───────────────────────────────────────────────────
    return (
        <div className={`min-h-screen bg-[#F4F7F9] pb-20 ${STORE_PUBLIC_SCOPE_CLASS}`}>
            <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center gap-3">
                    <Link to="/">
                        <Button variant="ghost" size="sm" className="rounded-xl hover:bg-slate-100">
                            <ArrowLeft className="w-4 h-4 text-[#001A54]" />
                        </Button>
                    </Link>
                    <h1 className="font-black italic uppercase tracking-tight text-xl text-[#001A54] flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-[#B6D433]" /> Finalizar compra
                    </h1>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                {/* Coluna esquerda — formulário */}
                <div className="space-y-6">
                    {/* Identificação */}
                    {!customer ? (
                        <Card className="border border-slate-100 shadow-[0_4px_20_rgba(0,0,0,0.02)]">
                            <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <p className="font-black text-[#001A54] text-base uppercase italic tracking-tight">Faça login para agilizar</p>
                                    <p className="text-xs text-slate-500 mt-1">Preencha seus dados automaticamente e acompanhe o status de seus pedidos.</p>
                                </div>
                                <Button variant="ghost" onClick={() => setLoginModalOpen(true)} className="gap-2 rounded-xl h-11 border border-slate-200 bg-white text-[#001A54] font-bold hover:bg-[#001A54]/5 hover:text-[#001A54] transition-all shrink-0">
                                    <User className="w-4 h-4" /> Entrar / Cadastrar
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="border border-emerald-100 bg-emerald-50/30 shadow-[0_4px_20_rgba(0,0,0,0.01)]">
                            <CardContent className="p-4 text-sm flex items-center gap-2 text-emerald-800 font-bold">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                Conectado com sucesso como: <strong className="text-emerald-950 font-black">{customer.name}</strong>
                            </CardContent>
                        </Card>
                    )}

                    {/* Dados pessoais */}
                    <Card className="border border-slate-100 shadow-[0_4px_20_rgba(0,0,0,0.02)]">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <CardTitle className="text-base font-black italic uppercase tracking-tight text-[#001A54] flex items-center gap-2">
                                <User className="w-5 h-5 text-[#B6D433]" />
                                Seus dados
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Nome completo *</label>
                                <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={nome} onChange={e => setNome(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Telefone *</label>
                                <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(67) 99999-9999" />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">E-mail</label>
                                <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                    CPF/CNPJ {precisaCpf && <span className="text-red-500">*</span>}
                                </label>
                                <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Modo de entrega */}
                    <Card className="border border-slate-100 shadow-[0_4px_20_rgba(0,0,0,0.02)]">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <CardTitle className="text-base font-black italic uppercase tracking-tight text-[#001A54] flex items-center gap-2">
                                <Truck className="w-5 h-5 text-[#B6D433]" />
                                Como você quer receber?
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setModoEntrega('retirada')}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 ${modoEntrega === 'retirada' ? 'border-[#001A54] bg-[#001A54]/5 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-300'}`}
                                >
                                    <Store className={`w-6 h-6 mb-2 ${modoEntrega === 'retirada' ? 'text-[#001A54]' : 'text-slate-400'}`} />
                                    <p className="font-bold text-sm text-[#001A54]">Retirar na loja</p>
                                    <p className="text-xs text-slate-500 mt-1">Grátis. Pronto em até 24h.</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModoEntrega('entrega')}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 ${modoEntrega === 'entrega' ? 'border-[#001A54] bg-[#001A54]/5 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-300'}`}
                                >
                                    <Truck className={`w-6 h-6 mb-2 ${modoEntrega === 'entrega' ? 'text-[#001A54]' : 'text-slate-400'}`} />
                                    <p className="font-bold text-sm text-[#001A54]">Entrega</p>
                                    <p className="text-xs text-slate-500 mt-1">Frete a combinar com a loja.</p>
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Endereço (entrega ou boleto) */}
                    {precisaEndereco && (
                        <Card className="border border-slate-100 shadow-[0_4px_20_rgba(0,0,0,0.02)]">
                            <CardHeader className="border-b border-slate-50 pb-4">
                                <CardTitle className="text-base font-black italic uppercase tracking-tight text-[#001A54] flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-[#B6D433]" /> Endereço de Entrega
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
                                <div className="sm:col-span-1">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">CEP *</label>
                                    <Input
                                        className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11"
                                        value={cep}
                                        onChange={e => setCep(e.target.value)}
                                        onBlur={e => buscarCep(e.target.value)}
                                        placeholder="00000-000"
                                    />
                                    {buscandoCep && <p className="text-xs text-slate-500 mt-1"><Loader2 className="w-3 h-3 inline animate-spin" /> Buscando...</p>}
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Logradouro *</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={logradouro} onChange={e => setLogradouro(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Número *</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={numero} onChange={e => setNumero(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Complemento</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={complemento} onChange={e => setComplemento(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Bairro *</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={bairro} onChange={e => setBairro(e.target.value)} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Cidade *</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={cidade} onChange={e => setCidade(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">UF *</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={uf} onChange={e => setUf(e.target.value.toUpperCase())} maxLength={2} />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Ponto de referência</label>
                                    <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={referencia} onChange={e => setReferencia(e.target.value)} />
                                </div>
                                {modoEntrega === 'entrega' && (
                                    <>
                                        <div className="sm:col-span-2">
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Nome de quem recebe *</label>
                                            <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={recebedorNome} onChange={e => setRecebedorNome(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Telefone do recebedor</label>
                                            <Input className="rounded-xl border-slate-200 focus-visible:ring-[#001A54]/20 focus-visible:border-[#001A54] h-11" value={recebedorTelefone} onChange={e => setRecebedorTelefone(e.target.value)} />
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Forma de pagamento */}
                    <Card className="border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <CardTitle className="text-base font-black italic uppercase tracking-tight text-[#001A54] flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-[#B6D433]" />
                                Forma de pagamento
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {FORMAS.map(f => {
                                    const Ico = f.icon
                                    const ativo = formaPagamento === f.value
                                    const desativado = f.value === 'pix' && !pixConfig.ativo
                                    return (
                                        <button
                                            key={f.value}
                                            type="button"
                                            disabled={desativado}
                                            onClick={() => setFormaPagamento(f.value)}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 ${ativo ? 'border-[#001A54] bg-[#001A54]/5 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-300'} ${desativado ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                                        >
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <Ico className={`w-5 h-5 ${ativo ? 'text-[#001A54]' : 'text-slate-400'}`} />
                                                <span className="font-bold text-sm text-[#001A54]">{f.label}</span>
                                                {f.presencial && <Badge className="text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border-none px-2.5 py-0.5 rounded-full">Pague depois</Badge>}
                                                {f.precisaLiberacao && <Badge className="text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border-none px-2.5 py-0.5 rounded-full">Sob análise</Badge>}
                                            </div>
                                            <p className="text-xs text-slate-500 leading-relaxed">{f.descricao}</p>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Mostrar chave PIX visível de forma super profissional se PIX estiver selecionado */}
                            {formaPagamento === 'pix' && pixConfig.ativo && pixConfig.chave_pix && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-100/80 flex items-start gap-3 mt-2"
                                >
                                    <QrCode className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="font-extrabold text-emerald-950">Chave PIX Oficial da Loja:</p>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <span className="font-mono bg-white px-3 py-1 rounded-xl border border-emerald-100 text-emerald-800 font-black text-sm shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                                                {pixConfig.chave_pix}
                                            </span>
                                            {pixConfig.nome_beneficiario && (
                                                <span className="text-xs text-emerald-700 font-bold">
                                                    ({pixConfig.nome_beneficiario})
                                                </span>
                                            )}
                                        </div>
                                        {pixConfig.instrucoes && (
                                            <p className="text-xs text-slate-500 mt-2.5 whitespace-pre-line leading-relaxed border-t border-emerald-100/30 pt-2.5">
                                                {pixConfig.instrucoes}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Observações */}
                    <Card className="border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <CardTitle className="text-base font-black italic uppercase tracking-tight text-[#001A54] flex items-center gap-2">
                                <FileText className="w-5 h-5 text-[#B6D433]" />
                                Observações (opcional)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <textarea
                                className="w-full border border-slate-200 rounded-xl p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[#001A54]/20 focus:border-[#001A54] transition-all"
                                value={observacoes}
                                onChange={e => setObservacoes(e.target.value)}
                                placeholder="Algo que devemos saber sobre a entrega ou retirada de suas peças?"
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Coluna direita — resumo */}
                <div>
                    <Card className="sticky top-24 border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <CardTitle className="text-base font-black italic uppercase tracking-tight text-[#001A54] flex items-center gap-2">
                                <ShoppingCart className="w-5 h-5 text-[#B6D433]" />
                                Resumo
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {items.map(it => (
                                    <div key={it.product_id} className="flex gap-3 items-start text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-800 line-clamp-2 leading-snug">{it.nome}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <button onClick={() => updateQuantity(it.product_id, Math.max(1, it.quantity - 1))} className="p-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors"><Minus className="w-3 h-3 text-slate-500" /></button>
                                                <span className="text-xs font-bold px-2 text-slate-700">{it.quantity}</span>
                                                <button 
                                                    disabled={it.quantity >= it.estoque_disponivel}
                                                    onClick={() => updateQuantity(it.product_id, it.quantity + 1)} 
                                                    className="p-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                 >
                                                    <Plus className="w-3 h-3 text-slate-500" />
                                                 </button>
                                                <button onClick={() => removeItem(it.product_id)} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors ml-auto"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs text-slate-400 font-medium">{fmtBRL(it.public_price)}</p>
                                            <p className="font-black text-sm text-[#001A54] mt-0.5">{fmtBRL(it.public_price * it.quantity)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
                                <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-bold text-slate-800">{fmtBRL(cartTotal)}</span></div>
                                <div className="flex justify-between text-slate-500"><span>Frete</span><span className="font-bold text-slate-800">{modoEntrega === 'retirada' ? 'Grátis' : 'A combinar'}</span></div>
                                <div className="flex justify-between font-black text-[#001A54] text-lg pt-3 border-t border-slate-50">
                                    <span>Total</span><span>{fmtBRL(cartTotal)}</span>
                                </div>
                            </div>

                            <Button
                                onClick={submit}
                                disabled={submitting}
                                className={`w-full ${STORE_ON_DARK} font-black uppercase italic tracking-wider h-12 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] border-none`}
                                style={{ backgroundColor: STORE_NAVY }}
                            >
                                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar pedido'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <StoreLoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
        </div>
    )
}
