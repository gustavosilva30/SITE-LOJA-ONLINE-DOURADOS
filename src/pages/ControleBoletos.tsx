import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { 
    Search, 
    FileText, 
    Calendar, 
    DollarSign, 
    CheckSquare, 
    Printer, 
    Loader2, 
    User,
    AlertCircle,
    Download,
    MessageCircle,
    History,
    Layers,
    X,
    Clock,
    Calculator,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Circle,
    Edit3,
    Save,
    Building2,
    Phone,
    AlertTriangle,
    Receipt,
    Bell
} from "lucide-react"
import { boletosApi } from "@/lib/api"
import { fmtCurrency, fmtDate } from "@/lib/format"
import { format, addDays, isBefore, startOfDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/authStore"

/**
 * Converte uma data do banco ("2026-08-17") em Date na meia-noite LOCAL.
 *
 * new Date("2026-08-17") interpreta como meia-noite UTC; exibido em UTC-4 vira
 * 16/08 às 21h, e a tela mostra o dia anterior. Era o que fazia um boleto pago
 * dia 17 aparecer como "Pago em 16/08".
 */
function dataLocal(valor: string | Date): Date {
    if (valor instanceof Date) return valor
    const texto = String(valor).trim()
    // Timestamp completo já carrega hora: deixa o navegador resolver.
    if (texto.includes("T") || texto.includes(" ")) return new Date(texto.replace(" ", "T"))
    return new Date(texto + "T00:00:00")
}

// ============================================================================
// INTERFACES
// ============================================================================

interface ClientePendente {
    id: string
    nome: string
    telefone?: string
    empresa_nome?: string
    empresa_whatsapp?: string
    total_pendente: number
    qtd_lancamentos: number
}

interface LancamentoPendente {
    id: string
    valor: number
    data_vencimento: string
    data_hora_aviso?: string
    descricao?: string
    venda_id?: string
    numero_pedido?: number
    status: string
    forma_pagamento?: string
    data_venda?: string
}

interface ParcelaLocal {
    numero: number
    valor: number
    data_vencimento: string
    data_hora_aviso?: string
}

interface ParcelaBoleto {
    id: string
    numero: number
    valor: number
    data_vencimento: string
    data_hora_aviso?: string
    aviso_enviado?: boolean
    status: "Pendente" | "Pago"
    data_pagamento?: string
}

interface HistoricoEmissao {
    id: string
    valor_total: number
    multa: number
    juros: number
    qtd_parcelas: number
    valor_parcela: number
    status: "Pendente" | "Pago"
    data_pagamento?: string
    created_at: string
    atendente_nome?: string
    pago_por_nome?: string
    cliente_nome?: string
    lancamentos_ids: string[]
    parcelas: ParcelaBoleto[]
}

// ============================================================================
// SUB-COMPONENTES
// ============================================================================

function StatusBadge({ status }: { status: string }) {
    const isPago = status === "Pago"
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
            isPago ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
        )}>
            {isPago ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
            {status}
        </span>
    )
}

function AvisoInput({ 
    parcela, 
    emissaoId, 
    loading, 
    onAgendar 
}: { 
    parcela: ParcelaBoleto
    emissaoId: string
    loading: boolean
    onAgendar: (parcelaId: string, emissaoId: string, dataHoraAviso: string | null) => void 
}) {
    const getLocalDatetimeValue = (dateStr?: string) => {
        if (!dateStr) return ""
        try {
            const d = new Date(dateStr)
            if (isNaN(d.getTime())) return ""
            const offset = d.getTimezoneOffset()
            const localDate = new Date(d.getTime() - offset * 60 * 1000)
            return localDate.toISOString().slice(0, 16)
        } catch {
            return ""
        }
    }

    const [localValue, setLocalValue] = useState(getLocalDatetimeValue(parcela.data_hora_aviso))

    useEffect(() => {
        setLocalValue(getLocalDatetimeValue(parcela.data_hora_aviso))
    }, [parcela.data_hora_aviso])

    const handleSave = () => {
        if (localValue) {
            try {
                const iso = new Date(localValue).toISOString()
                onAgendar(parcela.id, emissaoId, iso)
            } catch (error) {
                toast.error("Data/hora inválida")
            }
        } else {
            onAgendar(parcela.id, emissaoId, null)
        }
    }

    const isChanged = localValue !== getLocalDatetimeValue(parcela.data_hora_aviso)

    return (
        <div className="flex items-center gap-1.5">
            <input
                type="datetime-local"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                disabled={loading}
                className="bg-background text-foreground text-[10px] rounded-lg border border-border px-2 py-1 max-w-[170px] outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
            />
            {isChanged && (
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded text-[10px] font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                    Salvar
                </button>
            )}
            {parcela.data_hora_aviso && !isChanged && (
                <button
                    onClick={() => onAgendar(parcela.id, emissaoId, null)}
                    disabled={loading}
                    className="text-[10px] font-bold text-red-500 hover:text-red-600 px-2 py-1 rounded bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-all disabled:opacity-50"
                >
                    Remover
                </button>
            )}
        </div>
    )
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ControleBoletos() {
    const { atendente } = useAuthStore()
    const canDelete = atendente?.cargo === "administrador" || atendente?.cargo === "gerente"

    // ---- Estado Clientes ----
    const [clientes, setClientes] = useState<ClientePendente[]>([])
    const [loadingClientes, setLoadingClientes] = useState(true)
    const [selectedCliente, setSelectedCliente] = useState<ClientePendente | null>(null)
    const [search, setSearch] = useState("")

    // ---- Estado Pendências ----
    const [pendencias, setPendencias] = useState<LancamentoPendente[]>([])
    const [loadingPendencias, setLoadingPendencias] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isAgrupado, setIsAgrupado] = useState(false)

    // ---- Estado Acréscimos / Parcelamento ----
    const [multa, setMulta] = useState<number>(0)
    const [juros, setJuros] = useState<number>(0)
    const [qtdParcelas, setQtdParcelas] = useState<number>(1)

    // ---- Modal de Confirmação de Emissão ----
    const [showEmissaoModal, setShowEmissaoModal] = useState(false)
    const [parcelasModal, setParcelasModal] = useState<ParcelaLocal[]>([])
    const [loadingEmissao, setLoadingEmissao] = useState(false)

    // ---- Histórico ----
    const [showHistory, setShowHistory] = useState(false)
    const [historico, setHistorico] = useState<HistoricoEmissao[]>([])
    const [loadingHistorico, setLoadingHistorico] = useState(false)
    const [expandedEmissao, setExpandedEmissao] = useState<string | null>(null)
    const [loadingPagarId, setLoadingPagarId] = useState<string | null>(null)
    const [loadingAvisoId, setLoadingAvisoId] = useState<string | null>(null)
    const [loadingReenviarId, setLoadingReenviarId] = useState<string | null>(null)
    const [loadingRelatorioVendasId, setLoadingRelatorioVendasId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [searchHistorico, setSearchHistorico] = useState("")
    const [paginaHistorico, setPaginaHistorico] = useState(1)

    // ---- Edição Contato Empresa ----
    const [showEmpresaForm, setShowEmpresaForm] = useState(false)
    const [empresaNome, setEmpresaNome] = useState("")
    const [empresaWhatsapp, setEmpresaWhatsapp] = useState("")
    const [savingEmpresa, setSavingEmpresa] = useState(false)
    const [reportData, setReportData] = useState<any[]>([])
    const [isPrinting, setIsPrinting] = useState(false)

    const printRef = useRef<HTMLDivElement>(null)

    // ============================================================
    // EFEITOS
    // ============================================================

    useEffect(() => {
        fetchClientes()
    }, [])

    // Quando selecionado cliente, preencher form empresa
    useEffect(() => {
        if (selectedCliente) {
            setEmpresaNome(selectedCliente.empresa_nome || "")
            setEmpresaWhatsapp(selectedCliente.empresa_whatsapp || "")
        }
    }, [selectedCliente])

    // Gerar parcelas automaticamente ao abrir modal
    useEffect(() => {
        if (showEmissaoModal) {
            gerarParcelas()
        }
    }, [showEmissaoModal, qtdParcelas])

    // ============================================================
    // FUNÇÕES DE DADOS
    // ============================================================

    const fetchClientes = async () => {
        try {
            setLoadingClientes(true)
            const data = await boletosApi.listarClientesPendentes()
            setClientes(Array.isArray(data) ? data : [])
        } catch (error) {
            toast.error("Erro ao carregar clientes pendentes")
            setClientes([])
        } finally {
            setLoadingClientes(false)
        }
    }

    const handlePrintReport = async () => {
        try {
            setIsPrinting(true)
            toast.loading("Gerando relatório...", { id: "print-report" })
            const data = await boletosApi.relatorioDetalhado()
            setReportData(data)
            setTimeout(() => {
                toast.dismiss("print-report")
                window.print()
                setIsPrinting(false)
            }, 800)
        } catch (error) {
            console.error(error)
            toast.error("Erro ao gerar relatório", { id: "print-report" })
            setIsPrinting(false)
        }
    }

    const handleSelectCliente = async (cliente: ClientePendente) => {
        if (selectedCliente?.id === cliente.id) return
        setSelectedCliente(cliente)
        setSelectedIds(new Set())
        setMulta(0)
        setJuros(0)
        setQtdParcelas(1)
        setShowHistory(false)
        setShowEmissaoModal(false)
        setShowEmpresaForm(false)
        try {
            setLoadingPendencias(true)
            const data = await boletosApi.listarPendenciasCliente(cliente.id)
            setPendencias(Array.isArray(data) ? data : [])
        } catch (error) {
            toast.error("Erro ao carregar pendências do cliente")
            setPendencias([])
        } finally {
            setLoadingPendencias(false)
        }
    }

    const fetchHistorico = async () => {
        if (!selectedCliente) return
        try {
            setLoadingHistorico(true)
            const data = await boletosApi.listarHistorico(selectedCliente.id)
            setHistorico(Array.isArray(data) ? data : [])
            setSearchHistorico("")
            setPaginaHistorico(1)
            setShowHistory(true)
        } catch (error) {
            toast.error("Erro ao carregar histórico")
            setHistorico([])
        } finally {
            setLoadingHistorico(false)
        }
    }

    const handleVerBoletosEmitidos = async () => {
        setSelectedCliente(null)
        try {
            setLoadingHistorico(true)
            const data = await boletosApi.listarTodasEmissoes()
            setHistorico(Array.isArray(data) ? data : [])
            setSearchHistorico("")
            setPaginaHistorico(1)
            setShowHistory(true)
        } catch (error) {
            toast.error("Erro ao carregar histórico de boletos")
            setHistorico([])
        } finally {
            setLoadingHistorico(false)
        }
    }

    const handleReenviarWhatsApp = async (emissaoId: string) => {
        try {
            setLoadingReenviarId(emissaoId)
            await boletosApi.reenviarWhatsAppBoleto(emissaoId)
            toast.success("Mensagem de boleto adicionada à fila de envio!")
        } catch (error) {
            console.error(error)
            toast.error("Erro ao enfileirar mensagem de boleto")
        } finally {
            setLoadingReenviarId(null)
        }
    }

    const handleGerarRelatorioVendas = async (emissaoId: string, h: HistoricoEmissao) => {
        try {
            setLoadingRelatorioVendasId(emissaoId)
            const data = await boletosApi.relatorioVendasEmissao(emissaoId)
            
            // Gerar HTML
            const protocolo = h.id.split('-')[0].toUpperCase()
            const cliente = selectedCliente ? selectedCliente.nome : (h.cliente_nome || 'Cliente')
            const dataEmissao = format(new Date(h.created_at), "dd/MM/yyyy HH:mm")

            let html = `
            <html>
            <head>
                <title>Relatório de Vendas - Boleto ${protocolo}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10px; color: #111; padding: 10px 14px; }
                    .header-title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
                    .header-sub { font-size: 9px; color: #444; margin-bottom: 8px; }
                    .venda-bloco { margin-bottom: 6px; padding-top: 5px; border-top: 1px solid #bbb; }
                    .venda-titulo { font-size: 10px; font-weight: bold; margin-bottom: 2px; }
                    table { width: 100%; border-collapse: collapse; }
                    th { font-size: 9px; font-weight: bold; text-align: left; border-bottom: 1px solid #999; padding: 2px 3px; color: #555; text-transform: uppercase; }
                    td { font-size: 9px; padding: 2px 3px; border-bottom: 1px solid #e8e8e8; }
                    .text-right { text-align: right; }
                    .total-venda td { font-weight: bold; border-bottom: none; padding-top: 3px; color: #222; }
                    .total-geral { font-weight: bold; font-size: 11px; text-align: right; margin-top: 8px; padding-top: 5px; border-top: 2px solid #333; }
                    .assinaturas { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 0; }
                    .assinatura-campo { width: 44%; }
                    .assinatura-linha { border-top: 1px solid #333; margin-bottom: 4px; }
                    .assinatura-nome { font-size: 9px; font-weight: bold; text-align: center; }
                    .assinatura-label { font-size: 8px; text-align: center; color: #555; }
                    @media print {
                        @page { margin: 0.8cm 1cm; size: A4; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header-title">Relatório de Vendas do Boleto</div>
                <div class="header-sub">Protocolo: <strong>${protocolo}</strong> &nbsp;|&nbsp; Cliente: <strong>${cliente}</strong> &nbsp;|&nbsp; Emitido em: <strong>${dataEmissao}</strong></div>
            `

            if (!data || data.length === 0) {
                html += `<p>Nenhuma venda associada a este boleto.</p>`
            } else {
                let totalGeral = 0
                data.forEach((venda: any) => {
                    const dataV = venda.data_venda ? format(new Date(venda.data_venda), "dd/MM/yyyy HH:mm") : 'N/A'
                    html += `
                    <div class="venda-bloco">
                        <div class="venda-titulo">Venda #${venda.numero_pedido} &mdash; ${dataV}</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Produto</th>
                                    <th class="text-right" style="width:40px;">Qtd</th>
                                    <th class="text-right" style="width:80px;">Valor Unit.</th>
                                    <th class="text-right" style="width:80px;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                    `
                    if (venda.itens && venda.itens.length > 0) {
                        venda.itens.forEach((item: any) => {
                            const qtdDevolvida = Number(item.quantidade_devolvida || 0)
                            const valorDevolvido = Number(item.valor_devolvido || 0)
                            const devolvidoTag = qtdDevolvida > 0
                                ? `<div style="color:#b91c1c;font-size:8px;">Devolvido: ${qtdDevolvida} un. (-R$ ${valorDevolvido.toFixed(2).replace('.', ',')})</div>`
                                : ''
                            html += `
                                <tr>
                                    <td>${item.produto_nome || '-'}${devolvidoTag}</td>
                                    <td class="text-right">${item.quantidade}</td>
                                    <td class="text-right">R$ ${Number(item.preco_unitario).toFixed(2).replace('.', ',')}</td>
                                    <td class="text-right">R$ ${Number(item.subtotal).toFixed(2).replace('.', ',')}</td>
                                </tr>
                            `
                        })
                    } else {
                        html += `<tr><td colspan="4" style="text-align:center;color:#888;">Sem produtos detalhados</td></tr>`
                    }
                    html += `
                            </tbody>
                            <tfoot>
                                <tr class="total-venda">
                                    <td colspan="3" class="text-right">Total da Venda:</td>
                                    <td class="text-right">R$ ${Number(venda.valor_venda).toFixed(2).replace('.', ',')}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    `
                    totalGeral += Number(venda.valor_venda)
                })

                html += `
                    <div class="total-geral">Total Geral das Vendas: R$ ${totalGeral.toFixed(2).replace('.', ',')}</div>
                    <div class="assinaturas">
                        <div class="assinatura-campo">
                            <div class="assinatura-linha"></div>
                            <div class="assinatura-nome">Dourados Auto Peças</div>
                            <div class="assinatura-label">Assinatura / Carimbo</div>
                        </div>
                        <div class="assinatura-campo">
                            <div class="assinatura-linha"></div>
                            <div class="assinatura-nome">${cliente}</div>
                            <div class="assinatura-label">Assinatura / Carimbo</div>
                        </div>
                    </div>
                `
            }

            html += `
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
            `

            const win = window.open('', '_blank')
            if (win) {
                win.document.write(html)
                win.document.close()
            } else {
                toast.error("Permita pop-ups no seu navegador para abrir o relatório")
            }

        } catch (error) {
            console.error(error)
            toast.error("Erro ao gerar relatório de vendas")
        } finally {
            setLoadingRelatorioVendasId(null)
        }
    }


    const [loadingImprimirSelecionadas, setLoadingImprimirSelecionadas] = useState(false)

    const handleImprimirVendasSelecionadas = async () => {
        if (selectedIds.size === 0) return
        try {
            setLoadingImprimirSelecionadas(true)
            const data = await boletosApi.relatorioVendasPreview(Array.from(selectedIds))
            
            const cliente = selectedCliente ? selectedCliente.nome : 'Cliente'
            const dataHoje = format(new Date(), "dd/MM/yyyy HH:mm")

            let html = `
            <html>
            <head>
                <title>Prévia - Relatório de Vendas</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10px; color: #111; padding: 10px 14px; }
                    .header-title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
                    .header-sub { font-size: 9px; color: #444; margin-bottom: 8px; }
                    .venda-bloco { margin-bottom: 6px; padding-top: 5px; border-top: 1px solid #bbb; }
                    .venda-titulo { font-size: 10px; font-weight: bold; margin-bottom: 2px; }
                    table { width: 100%; border-collapse: collapse; }
                    th { font-size: 9px; font-weight: bold; text-align: left; border-bottom: 1px solid #999; padding: 2px 3px; color: #555; text-transform: uppercase; }
                    td { font-size: 9px; padding: 2px 3px; border-bottom: 1px solid #e8e8e8; }
                    .text-right { text-align: right; }
                    .total-venda td { font-weight: bold; border-bottom: none; padding-top: 3px; color: #222; }
                    .total-geral { font-weight: bold; font-size: 11px; text-align: right; margin-top: 8px; padding-top: 5px; border-top: 2px solid #333; }
                    .assinaturas { display: flex; justify-content: space-between; margin-top: 40px; }
                    .assinatura-campo { width: 44%; }
                    .assinatura-linha { border-top: 1px solid #333; margin-bottom: 4px; }
                    .assinatura-nome { font-size: 9px; font-weight: bold; text-align: center; }
                    .assinatura-label { font-size: 8px; text-align: center; color: #555; }
                    @media print {
                        @page { margin: 0.8cm 1cm; size: A4; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header-title">Relatório de Vendas (Prévia da Emissão)</div>
                <div class="header-sub">Cliente: <strong>${cliente}</strong> &nbsp;|&nbsp; Data: <strong>${dataHoje}</strong></div>
            `

            if (!data || data.length === 0) {
                html += `<p>Nenhuma venda encontrada para os lançamentos selecionados.</p>`
            } else {
                let totalGeral = 0
                data.forEach((venda: any) => {
                    const dataV = venda.data_venda ? format(new Date(venda.data_venda), "dd/MM/yyyy HH:mm") : 'N/A'
                    html += `
                    <div class="venda-bloco">
                        <div class="venda-titulo">Venda #${venda.numero_pedido} &mdash; ${dataV}</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Produto</th>
                                    <th class="text-right" style="width:40px;">Qtd</th>
                                    <th class="text-right" style="width:80px;">Valor Unit.</th>
                                    <th class="text-right" style="width:80px;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                    `
                    if (venda.itens && venda.itens.length > 0) {
                        venda.itens.forEach((item: any) => {
                            const qtdDevolvida = Number(item.quantidade_devolvida || 0)
                            const valorDevolvido = Number(item.valor_devolvido || 0)
                            const devolvidoTag = qtdDevolvida > 0
                                ? `<div style="color:#b91c1c;font-size:8px;">Devolvido: ${qtdDevolvida} un. (-R$ ${valorDevolvido.toFixed(2).replace('.', ',')})</div>`
                                : ''
                            html += `
                                <tr>
                                    <td>${item.produto_nome || '-'}${devolvidoTag}</td>
                                    <td class="text-right">${item.quantidade}</td>
                                    <td class="text-right">R$ ${Number(item.preco_unitario).toFixed(2).replace('.', ',')}</td>
                                    <td class="text-right">R$ ${Number(item.subtotal).toFixed(2).replace('.', ',')}</td>
                                </tr>
                            `
                        })
                    } else {
                        html += `<tr><td colspan="4" style="text-align:center;color:#888;">Sem produtos detalhados</td></tr>`
                    }
                    html += `
                            </tbody>
                            <tfoot>
                                <tr class="total-venda">
                                    <td colspan="3" class="text-right">Total da Venda:</td>
                                    <td class="text-right">R$ ${Number(venda.valor_venda).toFixed(2).replace('.', ',')}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    `
                    totalGeral += Number(venda.valor_venda)
                })

                html += `
                    <div class="total-geral">Total Geral das Vendas: R$ ${totalGeral.toFixed(2).replace('.', ',')}</div>
                    <div class="assinaturas">
                        <div class="assinatura-campo">
                            <div class="assinatura-linha"></div>
                            <div class="assinatura-nome">Dourados Auto Peças</div>
                            <div class="assinatura-label">Assinatura / Carimbo</div>
                        </div>
                        <div class="assinatura-campo">
                            <div class="assinatura-linha"></div>
                            <div class="assinatura-nome">${cliente}</div>
                            <div class="assinatura-label">Assinatura / Carimbo</div>
                        </div>
                    </div>
                `
            }

            html += `
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
            `

            const win = window.open('', '_blank')
            if (win) {
                win.document.write(html)
                win.document.close()
            } else {
                toast.error("Permita pop-ups no seu navegador para abrir o relatório")
            }

        } catch (error) {
            console.error(error)
            toast.error("Erro ao gerar relatório de vendas")
        } finally {
            setLoadingImprimirSelecionadas(false)
        }
    }


    // ============================================================
    // SELEÇÃO DE PENDÊNCIAS
    // ============================================================

    const toggleSelectAll = () => {
        if (selectedIds.size === pendencias.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(pendencias.map(p => p.id)))
        }
    }

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    // ============================================================
    // CÁLCULOS
    // ============================================================

    const totalBase = useMemo(() => {
        return pendencias
            .filter(p => selectedIds.has(p.id))
            .reduce((acc, curr) => acc + curr.valor, 0)
    }, [pendencias, selectedIds])

    const totalComAcrescimos = useMemo(() => totalBase + multa + juros, [totalBase, multa, juros])

    const valorPorParcela = useMemo(() => {
        return totalComAcrescimos / (qtdParcelas || 1)
    }, [totalComAcrescimos, qtdParcelas])

    const filteredClientes = useMemo(() => {
        return clientes.filter(c =>
            c.nome.toLowerCase().includes(search.toLowerCase()) ||
            (c.empresa_nome || "").toLowerCase().includes(search.toLowerCase())
        )
    }, [clientes, search])

    const pendenciasSelecionadas = useMemo(() => {
        return pendencias.filter(p => selectedIds.has(p.id))
    }, [pendencias, selectedIds])

    const pendenciasExibicao = useMemo(() => {
        if (!isAgrupado) return pendencias

        const grupos: Record<string, LancamentoPendente[]> = {}
        pendencias.forEach(p => {
            const data = format(dataLocal(p.data_vencimento), "yyyy-MM-dd")
            if (!grupos[data]) grupos[data] = []
            grupos[data].push(p)
        })

        return Object.entries(grupos).map(([data, itens]) => ({
            id: `group-${data}`,
            valor: itens.reduce((acc, curr) => acc + curr.valor, 0),
            data_vencimento: data,
            descricao: `${itens.length} lançamentos agrupados`,
            status: "Agrupado",
            itensIds: itens.map(i => i.id)
        })) as any[]
    }, [pendencias, isAgrupado])

    const historicoFiltradoEPaginado = useMemo(() => {
        let filtrado = historico
        if (searchHistorico) {
            const lowerSearch = searchHistorico.toLowerCase()
            filtrado = filtrado.filter(h => 
                h.id.toLowerCase().includes(lowerSearch) ||
                (h.cliente_nome && h.cliente_nome.toLowerCase().includes(lowerSearch)) ||
                (h.atendente_nome && h.atendente_nome.toLowerCase().includes(lowerSearch)) ||
                h.status.toLowerCase().includes(lowerSearch)
            )
        }
        
        const startIndex = (paginaHistorico - 1) * 15
        const endIndex = startIndex + 15
        const paginado = filtrado.slice(startIndex, endIndex)
        
        return {
            totalFiltrado: filtrado.length,
            paginado,
            totalPaginas: Math.ceil(filtrado.length / 15)
        }
    }, [historico, searchHistorico, paginaHistorico])

    // ============================================================
    // PARCELAS DO MODAL
    // ============================================================

    const gerarParcelas = useCallback(() => {
        const n = qtdParcelas || 1
        const valorBase = totalComAcrescimos / n
        const hoje = new Date()
        const novas: ParcelaLocal[] = Array.from({ length: n }, (_, i) => ({
            numero: i + 1,
            valor: i === n - 1
                // Última parcela absorve diferença de arredondamento
                ? Math.round((totalComAcrescimos - valorBase * (n - 1)) * 100) / 100
                : Math.round(valorBase * 100) / 100,
            data_vencimento: format(addDays(hoje, 30 * (i + 1)), "yyyy-MM-dd"),
        }))
        setParcelasModal(novas)
    }, [qtdParcelas, totalComAcrescimos])

    const updateParcelaData = (index: number, field: keyof ParcelaLocal, value: string | number) => {
        setParcelasModal(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: value }
            return updated
        })
    }

    // ============================================================
    // AÇÕES PRINCIPAIS
    // ============================================================

    const handleAbrirModalEmissao = () => {
        if (selectedIds.size === 0) {
            toast.warning("Selecione pelo menos um lançamento para confirmar a emissão")
            return
        }
        setShowEmissaoModal(true)
    }

    const handleConfirmarEmissao = async () => {
        if (!selectedCliente || parcelasModal.length === 0) return
        const gerarLogistica = window.confirm("Deseja gerar logística de boletos?")
        try {
            setLoadingEmissao(true)
            await boletosApi.registrarEmissao({
                cliente_id: selectedCliente.id,
                lancamentos_ids: Array.from(selectedIds),
                valor_total: totalBase,
                multa,
                juros,
                qtd_parcelas: qtdParcelas,
                valor_parcela: valorPorParcela,
                parcelas: parcelasModal.map(p => ({
                    numero: p.numero,
                    valor: p.valor,
                    data_vencimento: p.data_vencimento,
                    data_hora_aviso: p.data_hora_aviso,
                })),
                gerar_logistica: gerarLogistica
            })
            toast.success(`✅ Boleto de ${fmtCurrency(totalComAcrescimos)} emitido! Lançamentos quitados no financeiro.`)
            setShowEmissaoModal(false)
            setSelectedIds(new Set())
            setMulta(0)
            setJuros(0)
            setQtdParcelas(1)
            // Recarregar pendências (devem sumir as quitadas)
            const data = await boletosApi.listarPendenciasCliente(selectedCliente.id)
            setPendencias(Array.isArray(data) ? data : [])
            // Atualizar lista de clientes
            fetchClientes()
        } catch (error) {
            toast.error("Erro ao registrar emissão")
        } finally {
            setLoadingEmissao(false)
        }
    }

    const handlePagarEmissao = async (emissaoId: string) => {
        try {
            setLoadingPagarId(emissaoId)
            await boletosApi.pagarEmissao(emissaoId)
            toast.success("Boleto marcado como pago!")
            // Atualizar histórico local
            setHistorico(prev => prev.map(h => {
                if (h.id !== emissaoId) return h
                return {
                    ...h,
                    status: "Pago" as const,
                    data_pagamento: format(new Date(), "yyyy-MM-dd"),
                    parcelas: h.parcelas.map(p => ({
                        ...p,
                        status: "Pago" as const,
                        data_pagamento: format(new Date(), "yyyy-MM-dd")
                    }))
                }
            }))
        } catch (error) {
            toast.error("Erro ao marcar boleto como pago")
        } finally {
            setLoadingPagarId(null)
        }
    }

    const handlePagarParcela = async (parcelaId: string, emissaoId: string) => {
        try {
            setLoadingPagarId(parcelaId)
            const result = await boletosApi.pagarParcela(parcelaId)
            toast.success("Parcela marcada como paga!")
            // Atualizar estado local
            setHistorico(prev => prev.map(h => {
                if (h.id !== emissaoId) return h
                const novasParcelas = h.parcelas.map(p => {
                    if (p.id !== parcelaId) return p
                    return { ...p, status: "Pago" as const, data_pagamento: format(new Date(), "yyyy-MM-dd") }
                })
                const todasPagas = novasParcelas.every(p => p.status === "Pago")
                return {
                    ...h,
                    parcelas: novasParcelas,
                    status: todasPagas ? "Pago" as const : h.status,
                    data_pagamento: todasPagas ? format(new Date(), "yyyy-MM-dd") : h.data_pagamento,
                }
            }))
        } catch (error) {
            toast.error("Erro ao marcar parcela como paga")
        } finally {
            setLoadingPagarId(null)
        }
    }

    const handleAgendarAviso = async (parcelaId: string, emissaoId: string, dataHoraAviso: string | null) => {
        try {
            setLoadingAvisoId(parcelaId)
            await boletosApi.agendarAvisoParcela(parcelaId, dataHoraAviso)
            toast.success(dataHoraAviso ? "Aviso de vencimento agendado!" : "Agendamento de aviso removido!")
            
            // Atualizar estado local
            setHistorico(prev => prev.map(h => {
                if (h.id !== emissaoId) return h
                const novasParcelas = h.parcelas.map(p => {
                    if (p.id !== parcelaId) return p
                    return { 
                        ...p, 
                        data_hora_aviso: dataHoraAviso || undefined,
                        aviso_enviado: false 
                    }
                })
                return {
                    ...h,
                    parcelas: novasParcelas
                }
            }))
        } catch (error) {
            toast.error("Erro ao agendar aviso de vencimento")
        } finally {
            setLoadingAvisoId(null)
        }
    }

    const handleSalvarEmpresa = async () => {
        if (!selectedCliente) return
        try {
            setSavingEmpresa(true)
            await boletosApi.atualizarContatoEmpresa(selectedCliente.id, {
                empresa_nome: empresaNome || undefined,
                empresa_whatsapp: empresaWhatsapp || undefined,
            })
            // Atualizar local
            setSelectedCliente(prev => prev ? {
                ...prev,
                empresa_nome: empresaNome,
                empresa_whatsapp: empresaWhatsapp
            } : prev)
            setClientes(prev => prev.map(c => c.id === selectedCliente.id
                ? { ...c, empresa_nome: empresaNome, empresa_whatsapp: empresaWhatsapp }
                : c
            ))
            toast.success("Contato empresa salvo!")
            setShowEmpresaForm(false)
        } catch (error) {
            toast.error("Erro ao salvar contato empresa")
        } finally {
            setSavingEmpresa(false)
        }
    }

    const handleSendWhatsApp = () => {
        if (!selectedCliente) return
        const numero = selectedCliente.empresa_whatsapp || selectedCliente.telefone
        if (!numero) {
            toast.warning("Nenhum número de WhatsApp cadastrado para este cliente")
            return
        }
        const message = `Olá ${selectedCliente.empresa_nome || selectedCliente.nome}, informamos que há boletos pendentes no valor total de ${fmtCurrency(totalComAcrescimos)}. Por favor, entre em contato para regularização.`
        const tel = numero.replace(/\D/g, '')
        window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(message)}`, '_blank')
    }

    const handleExcluirEmissao = async (emissaoId: string) => {
        if (!window.confirm("Tem certeza que deseja excluir esta emissão de boleto? Os lançamentos voltarão a ficar pendentes.")) return
        try {
            setDeletingId(emissaoId)
            toast.loading("Excluindo...", { id: `excluir-${emissaoId}` })
            await boletosApi.excluirEmissao(emissaoId)
            toast.success("Emissão excluída com sucesso!", { id: `excluir-${emissaoId}` })
            
            // Remover do histórico local
            setHistorico(prev => prev.filter(h => h.id !== emissaoId))
            
            // Atualizar listas
            fetchClientes()
            if (selectedCliente) {
                const data = await boletosApi.listarPendenciasCliente(selectedCliente.id)
                setPendencias(Array.isArray(data) ? data : [])
            }
        } catch (error) {
            toast.error("Erro ao excluir emissão", { id: `excluir-${emissaoId}` })
        } finally {
            setDeletingId(null)
        }
    }

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div className="flex flex-col h-full gap-6">
            {/* HEADER */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        Controle de Boletos
                    </h1>
                    <p className="text-muted-foreground">
                        Gerencie cobranças, agrupe pendências e emita relatórios profissionais.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-card border border-border px-4 py-2 rounded-xl shadow-sm flex items-center gap-3">
                        <div className="bg-emerald-500/10 p-2 rounded-lg">
                            <DollarSign className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Selecionado</span>
                            <span className="text-xl font-black text-foreground">{fmtCurrency(totalComAcrescimos)}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleVerBoletosEmitidos}
                        className="h-14 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all flex items-center gap-2"
                    >
                        <History className="w-5 h-5" />
                        Ver Emitidos
                    </button>

                    <button
                        onClick={handlePrintReport}
                        disabled={isPrinting}
                        className="h-14 px-4 bg-secondary text-secondary-foreground rounded-xl font-bold hover:bg-secondary/80 transition-all flex items-center gap-2"
                    >
                        {isPrinting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                        Imprimir Relatório Geral
                    </button>

                    <button
                        onClick={handleImprimirVendasSelecionadas}
                        disabled={selectedIds.size === 0 || loadingImprimirSelecionadas}
                        className="h-14 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {loadingImprimirSelecionadas ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                        Imprimir Vendas Selecionadas
                    </button>

                    <button
                        onClick={handleAbrirModalEmissao}
                        disabled={selectedIds.size === 0}
                        className="h-14 px-6 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Confirmar Emissão
                    </button>
                </div>
            </header>

            {/* LAYOUT PRINCIPAL */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">

                {/* LISTA DE CLIENTES */}
                <aside className="lg:col-span-3 bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden no-print">
                    <div className="p-4 border-b border-border">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Buscar cliente ou empresa..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border-none rounded-xl focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {loadingClientes ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <span className="text-sm font-medium uppercase tracking-tighter text-center px-4">Buscando Clientes...</span>
                            </div>
                        ) : filteredClientes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                                <AlertCircle className="w-10 h-10 mb-2 opacity-20" />
                                <p className="text-xs">Nenhum cliente com boletos pendentes.</p>
                            </div>
                        ) : (
                            filteredClientes.map((cliente) => (
                                <button
                                    key={cliente.id}
                                    onClick={() => handleSelectCliente(cliente)}
                                    className={cn(
                                        "w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group",
                                        selectedCliente?.id === cliente.id
                                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                                            : "hover:bg-muted"
                                    )}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black",
                                            selectedCliente?.id === cliente.id ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                                        )}>
                                            {cliente.nome.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-bold text-sm truncate">{cliente.nome}</span>
                                            {cliente.empresa_nome && (
                                                <span className={cn(
                                                    "text-[9px] uppercase font-bold tracking-wider truncate flex items-center gap-1",
                                                    selectedCliente?.id === cliente.id ? "text-white/60" : "text-primary/70"
                                                )}>
                                                    <Building2 className="w-2.5 h-2.5" />
                                                    {cliente.empresa_nome}
                                                </span>
                                            )}
                                            <span className={cn(
                                                "text-[9px] uppercase font-black tracking-widest",
                                                selectedCliente?.id === cliente.id ? "text-white/60" : "text-muted-foreground"
                                            )}>
                                                {cliente.qtd_lancamentos} lançamentos
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0">
                                        <span className="font-black text-sm">{fmtCurrency(cliente.total_pendente)}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                {/* ÁREA PRINCIPAL */}
                <main className="lg:col-span-9 bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
                    <AnimatePresence mode="wait">
                        {showHistory ? (
                            // ================== HISTÓRICO ==================
                            <motion.div
                                key="history"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex-1 flex flex-col min-h-0"
                            >
                                <div className="p-6 border-b border-border flex flex-col gap-4 bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                                                <History className="w-6 h-6 text-amber-600" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold leading-none mb-1">Histórico de Boletos</h2>
                                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{selectedCliente?.nome || "Geral (Todos os Clientes)"}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-muted rounded-full">
                                            <X className="w-5 h-5 text-muted-foreground" />
                                        </button>
                                    </div>
                                    <div className="relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Pesquisar por cliente, protocolo ou status..."
                                            value={searchHistorico}
                                            onChange={(e) => {
                                                setSearchHistorico(e.target.value)
                                                setPaginaHistorico(1)
                                            }}
                                            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                    {loadingHistorico ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                                            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Buscando histórico...</span>
                                        </div>
                                    ) : historicoFiltradoEPaginado.paginado.length === 0 ? (
                                        <div className="text-center py-20 opacity-50 text-sm">Nenhuma emissão registrada ou encontrada na pesquisa.</div>
                                    ) : (
                                        <>
                                        {historicoFiltradoEPaginado.paginado.map(h => {
                                            const isExpanded = expandedEmissao === h.id
                                            const totalBoleto = Number(h.valor_total) + Number(h.multa) + Number(h.juros)
                                            const parcelasPendentes = h.parcelas.filter(p => p.status === "Pendente").length
                                            return (
                                                <div key={h.id} className={cn(
                                                    "rounded-2xl border-2 transition-all",
                                                    h.status === "Pago"
                                                        ? "border-emerald-500/30 bg-emerald-500/5"
                                                        : "border-border bg-background hover:border-amber-500/40"
                                                )}>
                                                    {/* Cabeçalho do boleto */}
                                                    <div className="p-4 flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className={cn(
                                                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                                                h.status === "Pago" ? "bg-emerald-500/10" : "bg-amber-500/10"
                                                            )}>
                                                                <Receipt className={cn("w-5 h-5", h.status === "Pago" ? "text-emerald-600" : "text-amber-600")} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-bold text-sm">
                                                                        Protocolo {h.id.split('-')[0].toUpperCase()}
                                                                        {!selectedCliente && h.cliente_nome && ` · ${h.cliente_nome}`}
                                                                    </span>
                                                                    <StatusBadge status={h.status} />
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase font-bold flex-wrap">
                                                                    <Clock className="w-3 h-3" />
                                                                    {format(new Date(h.created_at), "dd/MM/yyyy HH:mm")} — {h.atendente_nome || "Sistema"}
                                                                    {h.status === "Pago" && h.data_pagamento && (
                                                                        <span className="text-emerald-600 ml-1">· Pago em {format(dataLocal(h.data_pagamento), "dd/MM/yyyy")}</span>
                                                                    )}
                                                                    {h.parcelas && h.parcelas.length > 0 && (
                                                                        <span className={cn("ml-1", h.status === "Pago" ? "text-muted-foreground" : "text-amber-600 font-extrabold")}>
                                                                            · Venc: {h.parcelas.map(p => {
                                                                                try {
                                                                                    return format(new Date(p.data_vencimento + "T00:00:00"), "dd/MM/yyyy");
                                                                                } catch (e) {
                                                                                    return p.data_vencimento;
                                                                                }
                                                                            }).join(' / ')}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 shrink-0">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[9px] text-muted-foreground uppercase font-black">Parcelas</span>
                                                                <span className="font-bold text-sm">{h.qtd_parcelas || h.parcelas.length || 1}x</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[9px] text-muted-foreground uppercase font-black">Total</span>
                                                                <span className="font-black text-lg text-emerald-600">{fmtCurrency(totalBoleto)}</span>
                                                            </div>

                                                            {/* Botão Quitar Boleto */}
                                                            {h.status === "Pendente" && (
                                                                <button
                                                                    onClick={() => handlePagarEmissao(h.id)}
                                                                    disabled={loadingPagarId === h.id}
                                                                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                                                                >
                                                                    {loadingPagarId === h.id ? (
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircle2 className="w-3 h-3" />
                                                                    )}
                                                                    Quitar Boleto
                                                                </button>
                                                            )}

                                                            {/* Botão Relatório de Vendas */}
                                                            <button
                                                                onClick={() => handleGerarRelatorioVendas(h.id, h)}
                                                                disabled={loadingRelatorioVendasId === h.id}
                                                                title="Relatório das Vendas"
                                                                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                                                            >
                                                                {loadingRelatorioVendasId === h.id ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <Printer className="w-3 h-3" />
                                                                )}
                                                                Vendas
                                                            </button>

                                                            {/* Botão Reenviar WhatsApp */}
                                                            <button
                                                                onClick={() => handleReenviarWhatsApp(h.id)}
                                                                disabled={loadingReenviarId === h.id}
                                                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                                                            >
                                                                {loadingReenviarId === h.id ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    <MessageCircle className="w-3 h-3" />
                                                                )}
                                                                Enviar WhatsApp
                                                            </button>

                                                            {/* Botão Excluir */}
                                                            {canDelete && (
                                                                <button
                                                                    onClick={() => handleExcluirEmissao(h.id)}
                                                                    disabled={deletingId === h.id}
                                                                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                                                                    title="Excluir emissão (retorna lançamentos para Pendente)"
                                                                >
                                                                    {deletingId === h.id ? (
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                    ) : (
                                                                        <X className="w-3 h-3" />
                                                                    )}
                                                                    Excluir
                                                                </button>
                                                            )}

                                                            {/* Expandir parcelas */}
                                                            {h.parcelas.length > 0 && (
                                                                <button
                                                                    onClick={() => setExpandedEmissao(isExpanded ? null : h.id)}
                                                                    className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-all"
                                                                >
                                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Parcelas expandidas */}
                                                    <AnimatePresence>
                                                        {isExpanded && h.parcelas.length > 0 && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-4 pb-4">
                                                                    <div className="border-t border-border pt-4 space-y-2">
                                                                        <div className="flex items-center justify-between mb-3">
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                                                Parcelas ({parcelasPendentes} pendentes)
                                                                            </span>
                                                                        </div>
                                                                        {h.parcelas.map(parcela => (
                                                                            <div
                                                                                key={parcela.id}
                                                                                className={cn(
                                                                                    "flex flex-col p-3 rounded-xl border gap-2.5",
                                                                                    parcela.status === "Pago"
                                                                                        ? "bg-emerald-500/5 border-emerald-500/20"
                                                                                        : "bg-muted/30 border-border"
                                                                                )}
                                                                            >
                                                                                <div className="flex items-center justify-between w-full">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className={cn(
                                                                                            "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black",
                                                                                            parcela.status === "Pago"
                                                                                                ? "bg-emerald-500 text-white"
                                                                                                : "bg-muted text-muted-foreground"
                                                                                        )}>
                                                                                            {parcela.numero}
                                                                                        </div>
                                                                                        <div>
                                                                                            <p className="font-bold text-sm">{fmtCurrency(parcela.valor)}</p>
                                                                                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                                                <Calendar className="w-3 h-3" />
                                                                                                Venc: {format(new Date(parcela.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}
                                                                                                {parcela.status === "Pago" && parcela.data_pagamento && (
                                                                                                    <span className="text-emerald-600 ml-1">
                                                                                                        · Pago: {format(new Date(parcela.data_pagamento + "T00:00:00"), "dd/MM/yyyy")}
                                                                                                    </span>
                                                                                                )}
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <StatusBadge status={parcela.status} />
                                                                                        {parcela.status === "Pendente" && (
                                                                                            <button
                                                                                                onClick={() => handlePagarParcela(parcela.id, h.id)}
                                                                                                disabled={loadingPagarId === parcela.id}
                                                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                                                                                            >
                                                                                                {loadingPagarId === parcela.id ? (
                                                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                                                ) : (
                                                                                                    <CheckCircle2 className="w-3 h-3" />
                                                                                                )}
                                                                                                Pagar
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {parcela.status === "Pendente" && (
                                                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px]">
                                                                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                                                                            <Bell className="w-3.5 h-3.5 text-amber-500" />
                                                                                            <span>Aviso WhatsApp:</span>
                                                                                            {parcela.data_hora_aviso ? (
                                                                                                <span className={cn(
                                                                                                    "font-semibold",
                                                                                                    parcela.aviso_enviado ? "text-emerald-600" : "text-amber-600"
                                                                                                )}>
                                                                                                    {parcela.aviso_enviado 
                                                                                                        ? "Enviado" 
                                                                                                        : `Agendado (${format(new Date(parcela.data_hora_aviso), "dd/MM/yyyy HH:mm")})`}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="italic text-muted-foreground/60">Não agendado</span>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <AvisoInput
                                                                                                parcela={parcela}
                                                                                                emissaoId={h.id}
                                                                                                loading={loadingAvisoId === parcela.id}
                                                                                                onAgendar={handleAgendarAviso}
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )
                                        })}
                                        
                                        {historicoFiltradoEPaginado.totalPaginas > 1 && (
                                            <div className="flex items-center justify-between pt-4 mt-6 border-t border-border">
                                                <span className="text-xs text-muted-foreground font-bold">
                                                    Página {paginaHistorico} de {historicoFiltradoEPaginado.totalPaginas} ({historicoFiltradoEPaginado.totalFiltrado} itens)
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setPaginaHistorico(p => Math.max(1, p - 1))}
                                                        disabled={paginaHistorico === 1}
                                                        className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-muted disabled:opacity-50 transition-all"
                                                    >
                                                        Anterior
                                                    </button>
                                                    <button
                                                        onClick={() => setPaginaHistorico(p => Math.min(historicoFiltradoEPaginado.totalPaginas, p + 1))}
                                                        disabled={paginaHistorico === historicoFiltradoEPaginado.totalPaginas}
                                                        className="px-3 py-1.5 rounded-lg border border-border text-xs font-bold hover:bg-muted disabled:opacity-50 transition-all"
                                                    >
                                                        Próxima
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        </>
                                    )}
                                </div>
                            </motion.div>
                        ) : !selectedCliente ? (
                            // ================== SELECIONE UM CLIENTE ==================
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground"
                            >
                                <div className="w-24 h-24 rounded-3xl bg-muted flex items-center justify-center mb-6 animate-pulse">
                                    <User className="w-12 h-12 opacity-10" />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-2">Selecione um Cliente</h3>
                                <p className="max-w-xs text-sm">Escolha um cliente para gerenciar boletos.</p>
                            </motion.div>

                        ) : (
                            // ================== PENDÊNCIAS ==================
                            <motion.div
                                key={selectedCliente.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex-1 flex flex-col min-h-0"
                            >
                                {/* Header do Cliente */}
                                <div className="p-6 border-b border-border bg-muted/10">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                            <div className="flex items-center gap-5">
                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-xl shadow-primary/20">
                                                    <User className="w-8 h-8 text-white" />
                                                </div>
                                                <div>
                                                    <h2 className="text-2xl font-black tracking-tight leading-none mb-1">{selectedCliente.nome}</h2>
                                                    {selectedCliente.empresa_nome && (
                                                        <p className="text-sm text-primary font-bold flex items-center gap-1 mb-1">
                                                            <Building2 className="w-3.5 h-3.5" />
                                                            {selectedCliente.empresa_nome}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 px-2 py-1 rounded-md">
                                                            <FileText className="w-3 h-3" />
                                                            {pendencias.length} pendências
                                                        </span>
                                                        <button
                                                            onClick={handleSendWhatsApp}
                                                            className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 hover:text-emerald-600 uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-md transition-all"
                                                        >
                                                            <MessageCircle className="w-3 h-3" />
                                                            WhatsApp
                                                        </button>
                                                        <button
                                                            onClick={() => setShowEmpresaForm(!showEmpresaForm)}
                                                            className={cn(
                                                                "flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-md transition-all",
                                                                showEmpresaForm
                                                                    ? "bg-primary text-primary-foreground"
                                                                    : "text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted"
                                                            )}
                                                        >
                                                            <Building2 className="w-3 h-3" />
                                                            Contato Financeiro
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Controles Acréscimos / Parcelas */}
                                            <div className="bg-card border border-border p-3 rounded-2xl flex items-center gap-6 shadow-sm">
                                                <div className="flex flex-col border-r border-border pr-6">
                                                    <span className="text-[9px] uppercase font-black text-muted-foreground tracking-tighter mb-1">Ajustes (R$)</span>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-rose-400 font-bold uppercase">Multa</span>
                                                            <input
                                                                type="number"
                                                                value={multa || ''}
                                                                onChange={(e) => setMulta(Number(e.target.value))}
                                                                className="w-16 bg-transparent border-none p-0 focus:ring-0 font-black text-sm text-rose-500"
                                                                placeholder="0,00"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-amber-400 font-bold uppercase">Juros</span>
                                                            <input
                                                                type="number"
                                                                value={juros || ''}
                                                                onChange={(e) => setJuros(Number(e.target.value))}
                                                                className="w-16 bg-transparent border-none p-0 focus:ring-0 font-black text-sm text-amber-500"
                                                                placeholder="0,00"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Calculator className="w-3 h-3 text-primary" />
                                                        <span className="text-[9px] uppercase font-black text-muted-foreground tracking-tighter">Parcelamento</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <select
                                                            value={qtdParcelas}
                                                            onChange={(e) => setQtdParcelas(Number(e.target.value))}
                                                            className="bg-muted px-2 py-1 rounded-lg text-xs font-black border-none focus:ring-1 focus:ring-primary outline-none"
                                                        >
                                                            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                                                                <option key={n} value={n}>{n}x</option>
                                                            ))}
                                                        </select>
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-sm text-primary">{fmtCurrency(valorPorParcela)}</span>
                                                            <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-tighter">Cada Parcela</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Formulário Contato Empresa */}
                                        <AnimatePresence>
                                            {showEmpresaForm && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <Building2 className="w-4 h-4 text-blue-500" />
                                                            <span className="text-xs font-black uppercase tracking-widest text-blue-600">Contato Empresa — Boletos Automáticos</span>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block mb-1">Nome da Empresa</label>
                                                                <div className="relative">
                                                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                                    <input
                                                                        type="text"
                                                                        value={empresaNome}
                                                                        onChange={(e) => setEmpresaNome(e.target.value)}
                                                                        placeholder="Ex: Transportadora XYZ Ltda"
                                                                        className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block mb-1">WhatsApp (com DDD)</label>
                                                                <div className="relative">
                                                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                                    <input
                                                                        type="tel"
                                                                        value={empresaWhatsapp}
                                                                        onChange={(e) => setEmpresaWhatsapp(e.target.value)}
                                                                        placeholder="(67) 9 9999-9999"
                                                                        className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-end gap-3 mt-3">
                                                            <button onClick={() => setShowEmpresaForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">
                                                                Cancelar
                                                            </button>
                                                            <button
                                                                onClick={handleSalvarEmpresa}
                                                                disabled={savingEmpresa}
                                                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
                                                            >
                                                                {savingEmpresa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                                Salvar Contato
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Barra de Ações */}
                                <div className="px-6 py-3 border-b border-border bg-muted/5 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setIsAgrupado(!isAgrupado)}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                isAgrupado ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                        >
                                            <Layers className="w-3 h-3" />
                                            {isAgrupado ? "Agrupado por Data" : "Modo Individual"}
                                        </button>

                                        <div className="w-px h-4 bg-border" />

                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                            {selectedIds.size} selecionados
                                        </span>
                                    </div>

                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-[10px] uppercase font-black tracking-widest text-primary hover:underline"
                                    >
                                        {selectedIds.size === pendencias.length ? "Desmarcar Tudo" : "Selecionar Tudo"}
                                    </button>
                                </div>

                                {/* Lista de Pendências */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar bg-muted/5">
                                    {loadingPendencias ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                            <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sincronizando...</span>
                                        </div>
                                    ) : pendenciasExibicao.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                                            <CheckCircle2 className="w-12 h-12 mb-3 text-emerald-500/40" />
                                            <p className="font-bold">Nenhuma pendência encontrada</p>
                                            <p className="text-sm opacity-60">Todos os lançamentos estão quitados.</p>
                                        </div>
                                    ) : (
                                        pendenciasExibicao.map((p) => {
                                            const isGroup = p.id.startsWith('group-')
                                            const isVencido = isBefore(startOfDay(dataLocal(p.data_vencimento)), startOfDay(new Date()))
                                            const isSelected = isGroup
                                                ? p.itensIds.every((id: string) => selectedIds.has(id))
                                                : selectedIds.has(p.id)

                                            const handleRowClick = () => {
                                                if (isGroup) {
                                                    const next = new Set(selectedIds)
                                                    const allSelected = p.itensIds.every((id: string) => next.has(id))
                                                    p.itensIds.forEach((id: string) => {
                                                        if (allSelected) next.delete(id)
                                                        else next.add(id)
                                                    })
                                                    setSelectedIds(next)
                                                } else {
                                                    toggleSelect(p.id)
                                                }
                                            }

                                            return (
                                                <motion.div
                                                    key={p.id}
                                                    layout
                                                    onClick={handleRowClick}
                                                    className={cn(
                                                        "group relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-5",
                                                        isSelected
                                                            ? "bg-primary/10 border-primary shadow-lg shadow-primary/5"
                                                            : "bg-card border-transparent hover:border-muted-foreground/20 shadow-sm"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0",
                                                        isSelected ? "bg-primary text-white scale-110" : "bg-muted text-transparent"
                                                    )}>
                                                        <CheckSquare className="w-4 h-4" />
                                                    </div>

                                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Origem</span>
                                                            <div className="flex items-center gap-2">
                                                                {isGroup ? <Layers className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
                                                                <span className="font-bold text-sm">
                                                                    {isGroup ? "Lote Agrupado" : (p.numero_pedido ? `#${p.numero_pedido}` : "Avulso")}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Descrição</span>
                                                            <span className="text-sm text-muted-foreground truncate">{p.descricao || "Venda via Boleto"}</span>
                                                        </div>

                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Vencimento</span>
                                                            <span className={cn(
                                                                "font-bold text-sm flex items-center gap-1",
                                                                isVencido ? "text-rose-500" : "text-foreground"
                                                            )}>
                                                                {isVencido && <AlertTriangle className="w-3 h-3" />}
                                                                {fmtDate(p.data_vencimento)}
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-col items-end">
                                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Valor</span>
                                                            <span className="font-black text-lg text-foreground">{fmtCurrency(p.valor)}</span>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )
                                        })
                                    )}
                                </div>

                                {/* Rodapé com totais e ações */}
                                <div className="p-4 border-t border-border bg-card flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-6 flex-wrap">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Subtotal Bruto</span>
                                            <span className="font-black text-base">{fmtCurrency(totalBase)}</span>
                                        </div>
                                        {(multa > 0 || juros > 0) && (
                                            <>
                                                <div className="w-px h-8 bg-border" />
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Acréscimos</span>
                                                    <span className="font-black text-base text-rose-500">+{fmtCurrency(multa + juros)}</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="w-px h-8 bg-border" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Geral</span>
                                            <span className="font-black text-xl text-primary">{fmtCurrency(totalComAcrescimos)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-all"
                                            onClick={fetchHistorico}
                                        >
                                            <History className="w-4 h-4" />
                                            Histórico
                                        </button>
                                        <button
                                            onClick={handleAbrirModalEmissao}
                                            disabled={selectedIds.size === 0}
                                            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            <Download className="w-4 h-4" />
                                            Confirmar Emissão
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>

            {/* ================================================================
                MODAL DE CONFIRMAÇÃO DE EMISSÃO
            ================================================================ */}
            <AnimatePresence>
                {showEmissaoModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="w-full max-w-2xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
                        >
                            {/* Header Modal */}
                            <div className="p-6 border-b border-border bg-gradient-to-r from-primary/10 to-indigo-500/10">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-2xl font-black tracking-tight">Confirmar Emissão de Boleto</h2>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Defina as datas de vencimento de cada parcela antes de confirmar.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowEmissaoModal(false)}
                                        className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-all"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Conteúdo Modal */}
                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {/* Resumo */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Lançamentos</p>
                                        <p className="font-black text-2xl">{selectedIds.size}</p>
                                    </div>
                                    <div className="bg-muted/50 rounded-2xl p-4 text-center">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Parcelas</p>
                                        <p className="font-black text-2xl">{qtdParcelas}x</p>
                                    </div>
                                    <div className="bg-primary/10 rounded-2xl p-4 text-center border border-primary/20">
                                        <p className="text-[10px] font-black uppercase text-primary/70 mb-1">Total Geral</p>
                                        <p className="font-black text-2xl text-primary">{fmtCurrency(totalComAcrescimos)}</p>
                                    </div>
                                </div>

                                {/* Aviso de quitação */}
                                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-sm text-amber-700">Atenção: os lançamentos serão quitados</p>
                                        <p className="text-xs text-amber-600/80 mt-0.5">
                                            Ao confirmar, os {selectedIds.size} lançamento(s) selecionado(s) serão marcados como <strong>Pago</strong> no financeiro automaticamente.
                                        </p>
                                    </div>
                                </div>

                                {/* Tabela de Parcelas */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parcelas e Datas de Vencimento</span>
                                        <button
                                            onClick={gerarParcelas}
                                            className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest"
                                        >
                                            Regenerar Datas
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {parcelasModal.map((parcela, idx) => (
                                            <div key={idx} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
                                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black shrink-0">
                                                    {parcela.numero}
                                                </div>

                                                <div className="flex-1 grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Valor (R$)</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={parcela.valor}
                                                            onChange={(e) => updateParcelaData(idx, 'valor', parseFloat(e.target.value) || 0)}
                                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary/50 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Data de Vencimento</label>
                                                        <input
                                                            type="date"
                                                            value={parcela.data_vencimento}
                                                            onChange={(e) => updateParcelaData(idx, 'data_vencimento', e.target.value)}
                                                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary/50 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Rodapé Modal */}
                            <div className="p-6 border-t border-border flex items-center justify-between gap-4 bg-muted/20">
                                <button
                                    onClick={() => setShowEmissaoModal(false)}
                                    className="px-6 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmarEmissao}
                                    disabled={loadingEmissao}
                                    className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                                >
                                    {loadingEmissao ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Processando...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-5 h-5" />
                                            Confirmar e Quitar Boleto
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* IMPRESSÃO DO RELATÓRIO GERAL (ESCONDIDO NA TELA) */}
            <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-4 text-black print-relatorio" style={{ overflow: 'visible' }}>
                <div className="text-center mb-4">
                    <h1 className="text-xl font-black uppercase mb-0.5">Relatório de Vendas a Receber e Boletos</h1>
                    <p className="text-xs text-gray-500">Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
                </div>
                
                {reportData.map((cliente: any) => (
                    <div key={cliente.id} className="mb-4 border-b border-black pb-2 break-inside-avoid">
                        <h2 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2 flex items-center justify-between">
                            <span>{cliente.nome}</span>
                            <span className="text-xs font-normal text-gray-600">
                                Total Geral: {fmtCurrency(
                                    cliente.vendas.reduce((acc: number, v: any) => acc + (v.total || 0), 0) +
                                    cliente.avulsos.reduce((acc: number, a: any) => acc + (a.valor || 0), 0)
                                )}
                            </span>
                        </h2>
                        
                        {cliente.vendas?.map((venda: any) => (
                            <div key={venda.venda_id} className="mb-2 pl-3 border-l-2 border-gray-200 break-inside-avoid">
                                <div className="flex justify-between items-end mb-1">
                                    <div className="text-xs">
                                        <span className="font-bold">Pedido #{venda.numero_pedido}</span>
                                        <span className="text-gray-500 ml-2">- {fmtDate(venda.data_venda)}</span>
                                    </div>
                                    <span className="font-bold text-xs">{fmtCurrency(venda.total)}</span>
                                </div>
                                
                                {venda.produtos && venda.produtos.length > 0 && (
                                    <div className="mb-1.5">
                                        <p className="text-[10px] font-bold uppercase text-gray-500 mb-0.5">Produtos:</p>
                                        <table className="w-full text-xs mb-1">
                                            <tbody>
                                                {venda.produtos.map((p: any, idx: number) => (
                                                    <tr key={idx} className="border-b border-gray-100 last:border-0">
                                                        <td className="py-0.5 text-gray-700">{p.quantidade}x {p.nome}</td>
                                                        <td className="py-0.5 text-right text-gray-700">{fmtCurrency(p.subtotal)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                        
                        {cliente.avulsos && cliente.avulsos.length > 0 && (
                            <div className="mb-2 pl-3 border-l-2 border-gray-200 break-inside-avoid">
                                <span className="font-bold text-xs block mb-1">Lançamentos Avulsos</span>
                                <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                                    <ul className="text-xs">
                                        {cliente.avulsos.map((avulso: any) => (
                                            <li key={avulso.id} className="flex justify-between py-0.5 border-b border-gray-150 last:border-0">
                                                <span className="text-gray-700">Vencimento: {fmtDate(avulso.data_vencimento)} {avulso.descricao ? `(${avulso.descricao})` : ''}</span>
                                                <span className="font-bold">{fmtCurrency(avulso.valor)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>


            <style>{`
                @media print {
                    @page { margin: 10mm; }
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        background: white !important;
                    }
                    /* Esconde todo o layout do app */
                    body * {
                        visibility: hidden;
                    }
                    /* Mostra apenas a div de relatório e seus descendentes */
                    .print-relatorio, .print-relatorio * {
                        visibility: visible;
                    }
                    .print-relatorio { 
                        display: block !important; 
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        background: white !important;
                        color: black !important;
                        font-family: sans-serif;
                    }
                    /* Esconde toasts de aviso da biblioteca sonner */
                    [data-sonner-toaster] {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    )
}
