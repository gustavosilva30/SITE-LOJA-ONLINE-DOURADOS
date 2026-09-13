import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function newVendaItemRowId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `r_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

const DEFAULT_PRODUTO_DESCRICAO = `SR. A CLIENTE!
ANTES DE EFETUAR A COMPRA LEIA A DESCRIÇÃO COM ATENÇÃO:
*FRETE POR CONTA DO COMPRADOR!!!
*Somos loja física, devidamente instituída com CNPJ e IE, cadastrada ao DETRAN!!!
*Favor verificar as fotos antes de realizar a compra
*Recomendamos a instalação seja feita por um profissional especializado não nos responsabilizamos pela má instalação
*Todas as mercadorias anunciadas estão à pronta entrega
*Fotos reais, sem cortes ou edição.
*Pode ser retirado em loja física.
** Favor tirar todas as dúvidas no campo de perguntas antes de efetuar a compra. **
*Respeitamos prazos e garantias determinadas pelo Mercado Livre.
*A embalagem da mercadoria é feita com qualidade para não ocorrer avarias no transporte.
 ATENÇÃO PARA OS DADOS DE ENTREGA:
Confira o seu endereço de entrega cadastrado, não alteramos endereços após a compra.
 HORÁRIO DE ATENDIMENTO:
De Segunda à Sexta das 07:30 às 17:30
SÁBADO : 08:00h ás 12:00hr`;

function emptyVendaItem() {
    return {
        _rowId: newVendaItemRowId(),
        produto_id: '',
        quantidade: 1,
        preco_unitario: 0,
        desconto: 0,
        subtotal: 0,
        _search: '',
    }
}

interface DraftState {
    // Vendas
    isNovoPedidoModalOpen: boolean
    vendaItems: any[]
    vendaForm: any
    vendaDelivery: any
    editingVendaId: string | null

    // Clientes
    isClienteModalOpen: boolean
    newCliente: any
    editingCliente: any | null

    // Financeiro
    isFinanceiroModalOpen: boolean
    newFinanceiroEntry: any
    editingFinanceiroEntry: any | null

    // Produtos
    isProdutoModalOpen: boolean
    newProduto: any
    editingProduto: any | null

    // Orcamentos
    isOrcamentoModalOpen: boolean
    newOrcamento: any
    orcamentoItems: any[]
    editingOrcamentoId: string | null

    // Actions
    setVendasDraft: (draft: Partial<DraftState>) => void
    setClientesDraft: (draft: Partial<DraftState>) => void
    setFinanceiroDraft: (draft: Partial<DraftState>) => void
    setProdutosDraft: (draft: Partial<DraftState>) => void
    setOrcamentosDraft: (draft: Partial<DraftState>) => void
    clearVendasDraft: () => void
    clearClientesDraft: () => void
    clearFinanceiroDraft: () => void
    clearProdutosDraft: () => void
    clearOrcamentosDraft: () => void
}

export const useDraftStore = create<DraftState>()(
    persist(
        (set) => ({
            // Vendas Initial
            isNovoPedidoModalOpen: false,
            vendaItems: [emptyVendaItem()],
            vendaForm: {
                cliente_id: '',
                atendente_id: '',
                status: 'Pendente',
                forma_pagamento: 'Dinheiro',
                parcelas: 1,
                retirada_nome: '',
                cupom_id: null,
                desconto_cupom: 0,
                appliedCoupon: null
            },
            vendaDelivery: {
                cliente_contato: '',
                recebedor_nome: '',
                rua: '',
                numero: '',
                bairro: '',
                cidade: '',
                estado: '',
                cep: '',
                horario_entrega: '09:00',
                observacao_entrega: ''
            },
            editingVendaId: null,

            // Clientes Initial
            isClienteModalOpen: false,
            newCliente: {
                nome: '',
                razao_social: '',
                documento: '',
                inscricao_estadual: '',
                email: '',
                telefone: '',
                endereco: '',
                cep: '',
                codigo_ibge: '',
                endereco_logradouro: '',
                endereco_numero: '',
                endereco_complemento: '',
                endereco_bairro: '',
                endereco_cidade: '',
                endereco_uf: '',
                limite_credito: 0,
                vendedor_id: '',
                localizacao_id: '',
                observacao: '',
                representantes: []
            },
            editingCliente: null,

            // Financeiro Initial
            isFinanceiroModalOpen: false,
            newFinanceiroEntry: {
                tipo: 'Receita',
                valor: '',
                data_vencimento: new Date().toISOString().split('T')[0],
                categoria_financeira: 'Geral',
                status: 'Pendente',
                forma_pagamento: 'Dinheiro',
                descricao: '',
                centro_de_custo: '',
                recorrencia: 'unica',
                recorrencia_meses: 1
            },
            editingFinanceiroEntry: null,

            // Produtos Initial
            isProdutoModalOpen: false,
            newProduto: {
                sku: '',
                nome: '',
                descricao: DEFAULT_PRODUTO_DESCRICAO,
                estoque_atual: 1,
                estoque_minimo: 0,
                custo: 0,
                preco: 0,
                preco_prazo: 0,
                categoria_id: '',
                imagem_url: '',
                imagem_urls: [],
                compatibilidade: '',
                ativo: true,
                imobilizado: false,
                item_seguranca: false,
                rastreavel: false,
                codigo_etiqueta: '',
                part_number: '',
                localizacao: '',
                marca: '',
                modelo: '',
                ano: new Date().getFullYear(),
                ano_inicio: null,
                ano_fim: null,
                versao: '',
                cst: '',
                cfop: '',
                adicional_venda_percentual: 0,
                unidade_medida: 'UN',
                ncm: '',
                cest: '',
                outros_custos: 0,
                qualidade: 'A',
                origem: '',
                codigo_barras: '',
                peso_g: 0,
                altura_cm: 0,
                largura_cm: 0,
                comprimento_cm: 0,
                informacoes_adicionais: '',
                localizacao_id: '',
                meli_id: '',
                is_published: false,
                public_price: 0,
                slug: '',
                estoque_reservado: 0,
                variacao: '',
                lado_esquerdo: false,
                lado_direito: false,
                liso_para_pintura: false,
                com_furo_milha: false,
                sucata_id: '',
                condicao_produto: 'usado',
                motorizacao: '',
            },
            editingProduto: null,

            // Orcamentos Initial
            isOrcamentoModalOpen: false,
            newOrcamento: {
                cliente_id: '',
                cliente_tipo: 'cadastrado' as 'cadastrado' | 'avulso',
                cliente_avulso_nome: '',
                cliente_avulso_telefone: '',
                cliente_avulso_documento: '',
                vendedor_id: '',
                condicao_pagamento: 'À Vista',
                validade: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'Aberto',
                cupom_id: null,
                desconto_cupom: 0,
                appliedCoupon: null
            },
            orcamentoItems: [],
            editingOrcamentoId: null,

            setVendasDraft: (draft) => set((state) => {
                const next = { ...state, ...draft }
                if (draft.vendaItems) next.vendaItems = draft.vendaItems.filter(Boolean)
                return next
            }),
            setClientesDraft: (draft) => set((state) => ({ ...state, ...draft })),
            setFinanceiroDraft: (draft) => set((state) => ({ ...state, ...draft })),
            setProdutosDraft: (draft) => set((state) => ({ ...state, ...draft })),
            setOrcamentosDraft: (draft) => set((state) => {
                const next = { ...state, ...draft }
                if (draft.orcamentoItems) next.orcamentoItems = draft.orcamentoItems.filter(Boolean)
                return next
            }),

            clearVendasDraft: () => set({
                isNovoPedidoModalOpen: false,
                vendaItems: [emptyVendaItem()],
                editingVendaId: null,
                vendaForm: { cliente_id: '', atendente_id: '', status: 'Pendente', forma_pagamento: 'Dinheiro', parcelas: 1, retirada_nome: '', cupom_id: null, desconto_cupom: 0, appliedCoupon: null },
                vendaDelivery: {
                    cliente_contato: '',
                    recebedor_nome: '',
                    rua: '',
                    numero: '',
                    bairro: '',
                    cidade: '',
                    estado: '',
                    cep: '',
                    horario_entrega: '09:00',
                    observacao_entrega: ''
                }
            }),

            clearClientesDraft: () => set({
                isClienteModalOpen: false,
                newCliente: {
                    nome: '',
                    razao_social: '',
                    documento: '',
                    inscricao_estadual: '',
                    email: '',
                    telefone: '',
                    endereco: '',
                    cep: '',
                    codigo_ibge: '',
                    endereco_logradouro: '',
                    endereco_numero: '',
                    endereco_complemento: '',
                    endereco_bairro: '',
                    endereco_cidade: '',
                    endereco_uf: '',
                    limite_credito: 0,
                    vendedor_id: '',
                    localizacao_id: '',
                    observacao: '',
                    representantes: []
                },
                editingCliente: null
            }),

            clearFinanceiroDraft: () => set({
                isFinanceiroModalOpen: false,
                newFinanceiroEntry: {
                    tipo: 'Receita',
                    valor: '',
                    data_vencimento: new Date().toISOString().split('T')[0],
                    categoria_financeira: 'Geral',
                    status: 'Pendente',
                    forma_pagamento: 'Dinheiro',
                    descricao: '',
                    centro_de_custo: '',
                    recorrencia: 'unica',
                    recorrencia_meses: 1
                },
                editingFinanceiroEntry: null
            }),

            clearProdutosDraft: () => set({
                isProdutoModalOpen: false,
                newProduto: {
                    sku: '',
                    nome: '',
                    descricao: DEFAULT_PRODUTO_DESCRICAO,
                    estoque_atual: 1,
                    estoque_minimo: 0,
                    custo: 0,
                    preco: 0,
                    preco_prazo: 0,
                    categoria_id: '',
                    imagem_url: '',
                    imagem_urls: [],
                    compatibilidade: '',
                    ativo: true,
                    imobilizado: false,
                    item_seguranca: false,
                    rastreavel: false,
                    codigo_etiqueta: '',
                    part_number: '',
                    localizacao: '',
                    marca: '',
                    modelo: '',
                    ano: new Date().getFullYear(),
                    ano_inicio: null,
                    ano_fim: null,
                    versao: '',
                    cst: '',
                    cfop: '',
                    adicional_venda_percentual: 0,
                    unidade_medida: 'UN',
                    ncm: '',
                    cest: '',
                    outros_custos: 0,
                    qualidade: 'A',
                    origem: '',
                    codigo_barras: '',
                    peso_g: 0,
                    altura_cm: 0,
                    largura_cm: 0,
                    comprimento_cm: 0,
                    informacoes_adicionais: '',
                    localizacao_id: '',
                    meli_id: '',
                    is_published: false,
                    public_price: 0,
                    slug: '',
                    estoque_reservado: 0,
                    variacao: '',
                    lado_esquerdo: false,
                    lado_direito: false,
                    liso_para_pintura: false,
                    com_furo_milha: false,
                    sucata_id: '',
                    condicao_produto: 'usado',
                    motorizacao: '',
                },
                editingProduto: null
            }),

            clearOrcamentosDraft: () => set({
                isOrcamentoModalOpen: false,
                newOrcamento: {
                    cliente_id: '',
                    cliente_tipo: 'cadastrado',
                    cliente_avulso_nome: '',
                    cliente_avulso_telefone: '',
                    cliente_avulso_documento: '',
                    vendedor_id: '',
                    condicao_pagamento: 'À Vista',
                    validade: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    status: 'Aberto',
                    cupom_id: null,
                    desconto_cupom: 0,
                    appliedCoupon: null
                },
                orcamentoItems: [],
                editingOrcamentoId: null
            })
        }),
        {
            name: 'crm-drafts',
        }
    )
)
