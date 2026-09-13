import { useState, useEffect, useMemo, useRef } from "react"
import { toast } from 'sonner'
// jsPDF + jspdf-autotable são pesados (~700KB com deps). Carregam só quando o relatório é gerado.
import type { jsPDF as JsPDFType } from 'jspdf'
import { clientesApi, configuracoesApi, fiscalApi, mdfeApi, vendasApi, devolucoesApi, api } from "@/lib/api"
import { getAuthToken } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FileText, Loader2, Plus, RefreshCw, Box, AlertCircle, Calendar, CreditCard, ChevronDown, MonitorPlay, ArrowRight, Printer, FileCode, HandCoins, Truck, ShoppingCart, Info, User, Package, CheckCircle2, ChevronLeft, ChevronRight, Building2, X, Search, FileEdit, Ban, Download, Filter, MoreVertical, Eye, Trash2, Pencil } from 'lucide-react'
import { getApiBaseUrl } from "@/lib/apiBase"
import { useSearchParams } from "react-router-dom"
import { cn } from "@/lib/utils"
import { FiscalSelect } from "@/components/FiscalSelect"
import {
  CFOP_SAIDA,
  CFOP_ENTRADA,
  CSOSN_OPTIONS,
  CST_PIS_SAIDA,
  CST_COFINS_SAIDA,
  ICMS_ORIGEM_OPTIONS,
  FISCAL_REGIME_TRIBUTARIO_OPTIONS,
  normalizeCsosnStored,
} from "@/lib/tabelasFiscais"

import { suggestFiscalInfo } from "@/lib/fiscalSuggestions"

function formatNumPedido(n?: number | null) {
    if (!n) return '---'
    return '#' + String(n).padStart(6, '0')
}

function fmtData(iso?: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('pt-BR')
}

function notaItemNames(nota: any): string[] {
    const items = (nota?.focus_payload as any)?.items
    if (!Array.isArray(items)) return []
    const names = items
        .map((it: any) => String(it?.descricao || it?.descricao_produto || it?.produto || it?.nome || '').trim())
        .filter((s: string) => s.length > 0)
    return [...new Set(names)]
}

/** Remove acentos, cedilhas, hifens, pontos e converte para minúsculas para comparação flexível */
function normalizeStr(s: string): string {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
        .replace(/[-_.]/g, ' ')           // troca separadores por espaço
        .toLowerCase()
        .trim()
}

/**
 * Busca fuzzy: verifica se todas as palavras do `query` estão presentes
 * em `text`, em qualquer ordem e sem exigir acento/maiúsculas corretos.
 */
function fuzzyMatch(text: string, query: string): boolean {
    const normText = normalizeStr(text)
    const words = normalizeStr(query).split(/\s+/).filter(Boolean)
    return words.every(w => normText.includes(w))
}

/** Retorna `true` se pelo menos um dos textos fornecidos bater com o query */
function anyFuzzyMatch(texts: string[], query: string): boolean {
    return texts.some(t => fuzzyMatch(t, query))
}

export function Fiscal() {
    const [notas, setNotas] = useState<any[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [isEmitModalOpen, setIsEmitModalOpen] = useState(false)
    const [isInutilizacaoModalOpen, setIsInutilizacaoModalOpen] = useState(false)
    const [vendasConcluidas, setVendasConcluidas] = useState<any[]>([])
    const [loadingVendas, setLoadingVendas] = useState(false)
    const [selectedVendaId, setSelectedVendaId] = useState<string>("")
    const [emitting, setEmitting] = useState(false)
    const [validando, setValidando] = useState(false)
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const [lastFocusError, setLastFocusError] = useState<any>(null)

    // Inutilização (NF-e) — Produção
    const [inutilizacoes, setInutilizacoes] = useState<any[]>([])
    const [loadingInutilizacoes, setLoadingInutilizacoes] = useState(false)
    const [inutilNumeroInicial, setInutilNumeroInicial] = useState("")
    const [inutilNumeroFinal, setInutilNumeroFinal] = useState("")
    const [inutilJustificativa, setInutilJustificativa] = useState("")
    const [inutilSerie, setInutilSerie] = useState("1")
    const [inutilAno, setInutilAno] = useState(String(new Date().getFullYear()))
    const [inutilConfirmChecked, setInutilConfirmChecked] = useState(false)
    const [inutilConfirmText, setInutilConfirmText] = useState("")
    const [inutilizando, setInutilizando] = useState(false)

    // Filtros do modal de busca de venda
    const [vendaSearchTerm, setVendaSearchTerm] = useState("")
    const [filterDataInicio, setFilterDataInicio] = useState("")
    const [filterDataFim, setFilterDataFim] = useState("")

    const [cfopPadrao, setCfopPadrao] = useState("5405")
    const [cstPadrao, setCstPadrao] = useState("500")
    const [ncmPadrao, setNcmPadrao] = useState("00000000")
    const [cestPadrao, setCestPadrao] = useState("0000000")
    const [informacoesComplementares, setInformacoesComplementares] = useState("")
    const [icmsOrigemPadrao, setIcmsOrigemPadrao] = useState("0")
    const [pisSituacaoPadrao, setPisSituacaoPadrao] = useState("49")
    const [cofinsSituacaoPadrao, setCofinsSituacaoPadrao] = useState("49")
    const [regimeTributarioPadrao, setRegimeTributarioPadrao] = useState("1")

    // Busca de NCM
    const [ncmSearchQuery, setNcmSearchQuery] = useState("")
    const [ncmSearchResults, setNcmSearchResults] = useState<any[]>([])
    const [searchingNcm, setSearchingNcm] = useState(false)
    const [ncmPadraoDesc, setNcmPadraoDesc] = useState("")
    const [emissaoStep, setEmissaoStep] = useState(1) // 1 a 5
    const [emissaoTipo, setEmissaoTipo] = useState<'vincular' | 'avulsa' | 'devolucao' | 'devolucao_compra' | 'entrada_compra'>('vincular')
    const [adicionarAoEstoque, setAdicionarAoEstoque] = useState(false)
    const [selectedDevolucaoId, setSelectedDevolucaoId] = useState("")
    const [selectedFornecedorId, setSelectedFornecedorId] = useState("")
    const [chaveReferenciada, setChaveReferenciada] = useState("")
    
    // Devolução de Nota de Entrada (Compra)
    const [notasEntrada, setNotasEntrada] = useState<any[]>([])
    const [selectedNotaEntradaId, setSelectedNotaEntradaId] = useState("")
    const [devolucaoQuantities, setDevolucaoQuantities] = useState<Record<string, number>>({})
    const [devolucaoCompraMode, setDevolucaoCompraMode] = useState<'nota' | 'avulso'>('nota')
    const [tipoDocumento, setTipoDocumento] = useState<number>(1) // 1 = Saída, 0 = Entrada
    const [devolucoesAprovadas, setDevolucoesAprovadas] = useState<any[]>([])
    const [loadingDevolucoesAprovadas, setLoadingDevolucoesAprovadas] = useState(false)
    const [fornecedores, setFornecedores] = useState<any[]>([])
    const [loadingFornecedores, setLoadingFornecedores] = useState(false)
    const [fornecedorSearch, setFornecedorSearch] = useState("")
    const [devolucaoSelecionadaObj, setDevolucaoSelecionadaObj] = useState<any>(null)
    const [fornecedorSelecionadoObj, setFornecedorSelecionadoObj] = useState<any>(null)
    const [itensDevolucao, setItensDevolucao] = useState<any[]>([])

    const fetchDevolucoesAprovadas = async () => {
        setLoadingDevolucoesAprovadas(true)
        try {
            const data = await devolucoesApi.listar({ limit: 200 })
            setDevolucoesAprovadas(Array.isArray(data) ? data.filter((d: any) => d.status === 'Aprovado' || d.status === 'Concluido') : [])
        } catch (e) {
            console.error('[Fiscal] erro ao buscar devoluções:', e)
        } finally {
            setLoadingDevolucoesAprovadas(false)
        }
    }

    const fetchFornecedoresList = async () => {
        setLoadingFornecedores(true)
        try {
            const data = await configuracoesApi.listarFornecedores()
            setFornecedores(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error('[Fiscal] erro ao buscar fornecedores:', e)
        } finally {
            setLoadingFornecedores(false)
        }
    }

    const handleSelectNotaEntrada = (nota: any) => {
        setSelectedNotaEntradaId(nota.id)
        setChaveReferenciada(nota.chave_acesso || '')
        
        if (nota.fornecedor_cnpj) {
            const cleanCnpj = nota.fornecedor_cnpj.replace(/\D/g, '')
            const matchedForn = fornecedores.find(f => {
                const docClean = (f.cnpj || f.documento || '').replace(/\D/g, '')
                return docClean === cleanCnpj
            })
            if (matchedForn) {
                setSelectedFornecedorId(matchedForn.id)
                toast.success(`Fornecedor "${matchedForn.nome}" selecionado automaticamente!`)
            } else {
                setSelectedFornecedorId('')
                toast.warning(`Fornecedor "${nota.fornecedor_nome}" não encontrado na lista de cadastrados.`)
            }
        } else {
            setSelectedFornecedorId('')
        }

        const initialQtys: Record<string, number> = {}
        const initialItens = (nota.itens || []).map((it: any) => {
            initialQtys[it._key] = it.quantidade
            return {
                id: `xml-item-${it._key}`,
                descricao: it.nome,
                quantidade: it.quantidade,
                valor_unitario: it.custo,
                valor_total: it.quantidade * it.custo,
                ncm: it.ncm || it.part_number || ncmPadrao || '00000000',
                cest: it.cest || cestPadrao || '0000000',
                criar_produto: false
            }
        })
        setDevolucaoQuantities(initialQtys)
        setManualItens(initialItens)
    }

    const handleDevolucaoQtyChange = (itemKey: string, val: number, originalQty: number) => {
        const qty = Math.max(0, Math.min(originalQty, val))
        
        setDevolucaoQuantities(prev => {
            const next = { ...prev, [itemKey]: qty }
            
            const selectedNota = notasEntrada.find(n => n.id === selectedNotaEntradaId)
            if (selectedNota) {
                const nextManual = (selectedNota.itens || [])
                    .map((it: any) => {
                        const q = it._key === itemKey ? qty : (next[it._key] ?? it.quantidade)
                        if (q <= 0) return null
                        return {
                            id: `xml-item-${it._key}`,
                            descricao: it.nome,
                            quantidade: q,
                            valor_unitario: it.custo,
                            valor_total: q * it.custo,
                            ncm: it.ncm || it.part_number || ncmPadrao || '00000000',
                            cest: it.cest || cestPadrao || '0000000',
                            criar_produto: false
                        }
                    })
                    .filter(Boolean)
                setManualItens(nextManual)
            }
            
            return next
        })
    }

    const [manualItens, setManualItens] = useState<any[]>([])
    const [isManualItemModalOpen, setIsManualItemModalOpen] = useState(false);
    const [manualItemForm, setManualItemForm] = useState({
        nome: '',
        valor_unitario: 0,
        quantidade: 1,
        ncm: '',
        cest: '',
        criar_produto: true
    });
    const [isEditingManualItem, setIsEditingManualItem] = useState(false);
    const [editingManualItemId, setEditingManualItemId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>("Emitida");
    const [isClosingEmitModalConfirmationOpen, setIsClosingEmitModalConfirmationOpen] = useState(false);

    const [ncmSearchLoading, setNcmSearchLoading] = useState(false);
    const [ncmSearchItems, setNcmSearchItems] = useState<any[]>([]);
    const [cestSearchLoading, setCestSearchLoading] = useState(false);
    const [cestSearchItems, setCestSearchItems] = useState<any[]>([]);

    const fetchNcmSuggestions = async (query: string) => {
        const q = String(query || "").trim();
        if (!q) { setNcmSearchItems([]); return; }
        setNcmSearchLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`${getApiBaseUrl()}/api/fiscal/ncm/search?query=${q}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json();
            setNcmSearchItems(Array.isArray(json) ? json : []);
        } catch { setNcmSearchItems([]); } finally { setNcmSearchLoading(false); }
    };

    const fetchCestSuggestions = async (query: string) => {
        const q = String(query || "").trim();
        if (!q) { setCestSearchItems([]); return; }
        setCestSearchLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`${getApiBaseUrl()}/api/fiscal/cest/search?query=${q}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json();
            setCestSearchItems(Array.isArray(json) ? json : []);
        } catch { setCestSearchItems([]); } finally { setCestSearchLoading(false); }
    };
    const [clientes, setClientes] = useState<any[]>([])
    const [selectedClienteId, setSelectedClienteId] = useState("")
    const [loadingClientes, setLoadingClientes] = useState(false)
    const [clienteSearchTerm, setClienteSearchTerm] = useState("")
    const [codigoIbgeDestinatario, setCodigoIbgeDestinatario] = useState("")
    const [ambiente, setAmbiente] = useState<"homologacao" | "producao">("producao")

    const handleOpenManualItemModal = (item?: any) => {
        if (item) {
            setManualItemForm({
                nome: item.descricao || item.nome || "",
                valor_unitario: item.valor_unitario || 0,
                quantidade: item.quantidade || 1,
                ncm: item.ncm || "",
                cest: item.cest || "",
                criar_produto: item.criar_produto ?? false
            });
            setIsEditingManualItem(true);
            setEditingManualItemId(item.id);
        } else {
            setManualItemForm({
                nome: '',
                valor_unitario: 0,
                quantidade: 1,
                ncm: '',
                cest: '',
                criar_produto: true
            });
            setIsEditingManualItem(false);
            setEditingManualItemId(null);
        }
        setIsManualItemModalOpen(true);
    };

    const addManualItem = () => {
        setManualItens(prev => [...prev, { id: `manual-${Date.now()}`, nome: "", quantidade: 1, valor_unitario: 0 }])
    }
    
    const [isEditingClient, setIsEditingClient] = useState(false)
    const [clientEditForm, setClientEditForm] = useState({ documento: '', inscricao_estadual: '', rua: '', numero: '', bairro: '', complemento: '', cidade: '', estado: '', cep: '' })
    const [isCreatingNewClient, setIsCreatingNewClient] = useState(false)
    const [newClientForm, setNewClientForm] = useState({ 
        nome: '', documento: '', email: '', telefone: '', inscricao_estadual: '', 
        rua: '', numero: '', bairro: '', complemento: '', cidade: '', estado: '', cep: '' 
    })
    const [savingClient, setSavingClient] = useState(false)
    const [searchingDataForm, setSearchingDataForm] = useState(false)
    const [ncmSuggestions, setNcmSuggestions] = useState<any[]>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)
    const [loadingIbge, setLoadingIbge] = useState(false)
    const [itensFiscalOverrides, setItensFiscalOverrides] = useState<Record<string, { ncm: string, cest?: string }>>({})
    const [filterDataInicioList, setFilterDataInicioList] = useState("");
    const [filterDataFimList, setFilterDataFimList] = useState("");
    const [activeTabPasso4, setActiveTabPasso4] = useState<'geral' | 'produtos'>('geral')


    useEffect(() => {
        const doc = clientEditForm.documento?.replace(/\D/g, '') || '';
        if (doc.length === 14 && isEditingClient) {
            const timeout = setTimeout(async () => {
                setSearchingDataForm(true);
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
                    if (res.ok) {
                        const data = await res.json();
                        setClientEditForm(prev => ({
                            ...prev,
                            rua: data.logradouro || prev.rua,
                            numero: data.numero || prev.numero,
                            bairro: data.bairro || prev.bairro,
                            complemento: data.complemento || prev.complemento,
                            cidade: data.municipio || prev.cidade,
                            estado: data.uf || prev.estado,
                            cep: data.cep ? String(data.cep) : prev.cep
                        }));
                    }
                } catch (e) {}
                setSearchingDataForm(false);
            }, 600);
            return () => clearTimeout(timeout);
        }
    }, [clientEditForm.documento, isEditingClient]);

    useEffect(() => {
        const cp = clientEditForm.cep?.replace(/\D/g, '') || '';
        if (cp.length === 8 && isEditingClient) {
            const timeout = setTimeout(async () => {
                setSearchingDataForm(true);
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cp}`);
                    if (res.ok) {
                        const data = await res.json();
                        setClientEditForm(prev => ({
                            ...prev,
                            rua: data.street || prev.rua,
                            bairro: data.neighborhood || prev.bairro,
                            cidade: data.city || prev.cidade,
                            estado: data.state || prev.estado
                        }));
                    }
                } catch (e) {}
                setSearchingDataForm(false);
            }, 600);
            return () => clearTimeout(timeout);
        }
    }, [clientEditForm.cep, isEditingClient]);

    // Busca automática para Novo Cliente (CNPJ)
    useEffect(() => {
        const doc = newClientForm.documento?.replace(/\D/g, '') || '';
        if (doc.length === 14 && isCreatingNewClient) {
            const timeout = setTimeout(async () => {
                setSearchingDataForm(true);
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
                    if (res.ok) {
                        const data = await res.json();
                        setNewClientForm(prev => ({
                            ...prev,
                            nome: data.razao_social || data.nome_fantasia || prev.nome,
                            rua: data.logradouro || prev.rua,
                            numero: data.numero || prev.numero,
                            bairro: data.bairro || prev.bairro,
                            complemento: data.complemento || prev.complemento,
                            cidade: data.municipio || prev.cidade,
                            estado: data.uf || prev.estado,
                            cep: data.cep ? String(data.cep) : prev.cep
                        }));
                    }
                } catch (e) {}
                setSearchingDataForm(false);
            }, 600);
            return () => clearTimeout(timeout);
        }
    }, [newClientForm.documento, isCreatingNewClient]);

    // Busca automática para Novo Cliente (CEP)
    useEffect(() => {
        const cp = newClientForm.cep?.replace(/\D/g, '') || '';
        if (cp.length === 8 && isCreatingNewClient) {
            const timeout = setTimeout(async () => {
                setSearchingDataForm(true);
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cp}`);
                    if (res.ok) {
                        const data = await res.json();
                        setNewClientForm(prev => ({
                            ...prev,
                            rua: data.street || prev.rua,
                            bairro: data.neighborhood || prev.bairro,
                            cidade: data.city || prev.cidade,
                            estado: data.state || prev.estado
                        }));
                    }
                } catch (e) { }
                setSearchingDataForm(false);
            }, 600);
            return () => clearTimeout(timeout);
        }
    }, [newClientForm.cep, isCreatingNewClient]);

    const handleSaveClientEdit = async (cliId: string) => {
        if (!cliId) return;
        setSavingClient(true)

        const cepLimpo = clientEditForm.cep.replace(/\D/g, '')
        const payload = {
            documento: clientEditForm.documento,
            inscricao_estadual: clientEditForm.inscricao_estadual || null,
            endereco_logradouro: clientEditForm.rua.trim() || null,
            endereco_numero: clientEditForm.numero.trim() || null,
            endereco_complemento: clientEditForm.complemento.trim() || null,
            endereco_bairro: clientEditForm.bairro.trim() || null,
            endereco_cidade: clientEditForm.cidade.trim() || null,
            endereco_uf: clientEditForm.estado.trim().toUpperCase() || null,
            cep: cepLimpo || null,
        };

        try {
            await clientesApi.atualizar(cliId, payload)
            if (emissaoTipo === 'vincular') {
                setVendasConcluidas(prev => prev.map(v => v.id === selectedVendaId ? {
                    ...v,
                    clientes: { ...v.clientes, ...payload }
                } : v))
            } else {
                setClientes(prev => prev.map(c => c.id === cliId ? { ...c, ...payload } : c))
            }
            setIsEditingClient(false)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            alert("Erro ao salvar cliente: " + msg)
        } finally {
            setSavingClient(false)
        }
    }

    const handleCreateNewClient = async () => {
        if (!newClientForm.nome || !newClientForm.documento) {
            alert("Nome e Documento são obrigatórios.");
            return;
        }

        setSavingClient(true);
        try {
            const cepLimpo = newClientForm.cep.replace(/\D/g, '')
            const payload: any = {
                nome: newClientForm.nome,
                documento: newClientForm.documento,
                email: newClientForm.email || null,
                telefone: newClientForm.telefone || null,
                inscricao_estadual: newClientForm.inscricao_estadual || null,
                endereco_logradouro: newClientForm.rua.trim() || null,
                endereco_numero: newClientForm.numero.trim() || null,
                endereco_complemento: newClientForm.complemento.trim() || null,
                endereco_bairro: newClientForm.bairro.trim() || null,
                endereco_cidade: newClientForm.cidade.trim() || null,
                endereco_uf: newClientForm.estado.trim().toUpperCase() || null,
                cep: cepLimpo || null,
            };

            const novo = await clientesApi.criar(payload);
            const novoId = novo.id;

            if (emissaoTipo === 'vincular' && selectedVendaId) {
                // Atualiza a venda para o novo cliente
                await vendasApi.editar(selectedVendaId, { cliente_id: novoId });
                // Recarrega os dados da venda no modal
                await fetchVendasConcluidas(selectedVendaId);
            } else {
                setSelectedClienteId(novoId);
                await searchBackendClientes(""); 
            }

            setIsCreatingNewClient(false);
            setNewClientForm({ 
                nome: '', documento: '', email: '', telefone: '', inscricao_estadual: '', 
                rua: '', numero: '', bairro: '', complemento: '', cidade: '', estado: '', cep: '' 
            });
            alert("Cliente cadastrado com sucesso!");
        } catch (e: any) {
            alert("Erro ao criar cliente: " + (e?.message || e));
        } finally {
            setSavingClient(false);
        }
    }
    const removeManualItem = (id: string) => {
        setManualItens(prev => prev.filter(i => i.id !== id))
    }
    const updateManualItem = (id: string, field: string, val: any) => {
        setManualItens(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i))
    }

    const [debouncedClienteSearchTerm, setDebouncedClienteSearchTerm] = useState("")

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedClienteSearchTerm(clienteSearchTerm)
        }, 300)
        return () => clearTimeout(timer)
    }, [clienteSearchTerm])

    const searchBackendClientes = async (term: string) => {
        setLoadingClientes(true)
        try {
            const data = await clientesApi.listar({ q: term.trim() || undefined, limit: 50 })
            if (data) setClientes(data)
        } catch (e) {
            console.error('[Fiscal] busca clientes:', e)
        } finally {
            setLoadingClientes(false)
        }
    }

    useEffect(() => {
        if (isEmitModalOpen && emissaoTipo === 'avulsa') {
            searchBackendClientes(debouncedClienteSearchTerm)
            if (manualItens.length === 0) addManualItem()
        }
    }, [isEmitModalOpen, emissaoTipo, debouncedClienteSearchTerm])

    useEffect(() => {
        if (emissaoTipo === 'vincular' || emissaoTipo === 'avulsa') {
            setTipoDocumento(1) // Saída
        }
    }, [emissaoTipo])

    useEffect(() => {
        if (isEmitModalOpen) {
            if (emissaoTipo === 'devolucao') {
                fetchDevolucoesAprovadas()
            } else if (emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') {
                fetchFornecedoresList()
                const fetchNotasEntrada = async () => {
                    try {
                        const data = await api.get('/api/compra-notas-entrada')
                        setNotasEntrada(Array.isArray(data) ? data : [])
                    } catch (e) {
                        console.error('Erro ao buscar notas de entrada:', e)
                        setNotasEntrada([])
                    }
                }
                fetchNotasEntrada()
                setSelectedNotaEntradaId("")
                setDevolucaoQuantities({})
                setDevolucaoCompraMode('nota')
                setManualItens([])
            }
        }
    }, [isEmitModalOpen, emissaoTipo])

    useEffect(() => {
        if (selectedDevolucaoId && emissaoTipo === 'devolucao') {
            const dev = devolucoesAprovadas.find(d => d.id === selectedDevolucaoId)
            if (dev) {
                setDevolucaoSelecionadaObj(dev)
                setTipoDocumento(0) // Entrada por padrão para devolução de venda
                
                // Busca os dados completos do cliente para preencher o destinatário
                const cid = dev.cliente_id;
                if (cid) {
                    clientesApi.detalhe(cid).then(c => {
                        setDevolucaoSelecionadaObj((prev: any) => prev ? { ...prev, clientes: c } : prev);
                    }).catch(console.error);
                } else if (dev.venda_id) {
                    vendasApi.detalhe(dev.venda_id).then(v => {
                        if (v.cliente_id) {
                            clientesApi.detalhe(v.cliente_id).then(c => {
                                setDevolucaoSelecionadaObj((prev: any) => prev ? { ...prev, clientes: c } : prev);
                            }).catch(console.error);
                        }
                    }).catch(console.error);
                }
                
                // Sugere o CFOP correto de devolução de venda
                const cliUf = (dev.clientes?.uf || dev.clientes?.estado || '').trim().toUpperCase()
                const isInter = cliUf && cliUf !== 'MS'
                setCfopPadrao(isInter ? "2202" : "1202")
                toast.info(`CFOP de Entrada por Devolução sugerido: ${isInter ? "2202" : "1202"}`)
                
                // Busca itens da devolução e tenta achar a nota original da venda
                setItensDevolucao([])
                devolucoesApi.detalhe(selectedDevolucaoId)
                    .then((detail) => {
                        const its = detail?.itens || []
                        setItensDevolucao(its)
                        if (detail?.venda_id) {
                            fiscalApi.listarNotasFiscais().then((notasLst: any[]) => {
                                const original = (notasLst || []).find((n: any) => n.venda_id === detail.venda_id && n.status === 'Emitida' && n.tipo === 'NFe')
                                if (original?.chave_acesso) {
                                    const cleanedChave = original.chave_acesso.replace(/\D/g, '').slice(0, 44);
                                    setChaveReferenciada(cleanedChave)
                                    toast.success("Chave de acesso original encontrada e preenchida automaticamente.")
                                } else {
                                    setChaveReferenciada("")
                                }
                            }).catch(() => setChaveReferenciada(""))
                        } else {
                            setChaveReferenciada("")
                        }
                    })
                    .catch(() => setItensDevolucao([]))
            }
        }
    }, [selectedDevolucaoId, emissaoTipo, devolucoesAprovadas])

    useEffect(() => {
        if (selectedFornecedorId && (emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra')) {
            const forn = fornecedores.find(f => f.id === selectedFornecedorId)
            if (forn) {
                setFornecedorSelecionadoObj(forn)
                
                if (emissaoTipo === 'devolucao_compra') {
                    setTipoDocumento(1) // Saída por padrão para devolução de compra
                    
                    // Sugere o CFOP correto de devolução de compra
                    const fornUf = (forn.estado || forn.uf || '').trim().toUpperCase()
                    const isInter = fornUf && fornUf !== 'MS'
                    setCfopPadrao(isInter ? "6202" : "5202")
                    toast.info(`CFOP de Devolução sugerido: ${isInter ? "6202" : "5202"}`)
                } else {
                    setTipoDocumento(0) // Entrada por padrão para entrada de compra
                }
            }
        }
    }, [selectedFornecedorId, emissaoTipo, fornecedores])

    const clienteSelecionadoManual = useMemo(() => {
        return clientes.find(c => c.id === selectedClienteId)
    }, [clientes, selectedClienteId])

    const clientesFiltrados = clientes; // A filtragem agora é feita via banco de dados

    const fornecedoresFiltrados = useMemo(() => {
        if (!fornecedorSearch.trim()) return fornecedores;
        const q = fornecedorSearch.toLowerCase();
        const searchDigits = q.replace(/\D/g, "");
        return fornecedores.filter((f: any) => {
            const nome = (f.nome || "").toLowerCase();
            const razao = (f.razao_social || "").toLowerCase();
            const cnpj = (f.cnpj || f.documento || "").replace(/\D/g, "");
            const cidade = (f.cidade || "").toLowerCase();
            const estado = (f.estado || "").toLowerCase();
            const matchesCnpj = searchDigits ? cnpj.includes(searchDigits) : false;
            return (
                nome.includes(q) ||
                razao.includes(q) ||
                matchesCnpj ||
                cidade.includes(q) ||
                estado.includes(q)
            );
        });
    }, [fornecedores, fornecedorSearch]);

    useEffect(() => {
        setFornecedorSearch("")
    }, [emissaoTipo])

    const totalManual = useMemo(() => {
        return manualItens.reduce((acc, it) => acc + (Number(it.quantidade) * Number(it.valor_unitario || it.preco_unitario || 0)), 0)
    }, [manualItens])

    const totalDevolucao = useMemo(() => {
        return itensDevolucao.reduce((acc, it) => acc + (Number(it.quantidade) * Number(it.preco_unitario || it.valor_unitario || 0)), 0)
    }, [itensDevolucao])

    // ─── MDF-e ────────────────────────────────────────────────────────────────
    const [activeMainTab, setActiveMainTab] = useState<'nfe' | 'mdfe'>('nfe')
    const [mdfes, setMdfes] = useState<any[]>([])
    const [loadingMdfes, setLoadingMdfes] = useState(false)
    const [isMdfeModalOpen, setIsMdfeModalOpen] = useState(false)
    const [mdfeStep, setMdfeStep] = useState(1) // 1=Transporte 2=NF-e Vinculadas 3=Carga 4=Revisão
    const [emittingMdfe, setEmittingMdfe] = useState(false)
    const [mdfeFilterInicio, setMdfeFilterInicio] = useState("")
    const [mdfeFilterFim, setMdfeFilterFim] = useState("")
    const [mdfeSearchTerm, setMdfeSearchTerm] = useState("")

    // Dados do formulário MDF-e
    const [mdfeUfInicio, setMdfeUfInicio] = useState("")
    const [mdfeUfFim, setMdfeUfFim] = useState("")
    const [mdfePlaca, setMdfePlaca] = useState("")
    const [mdfeUfVeiculo, setMdfeUfVeiculo] = useState("")
    const [mdfeRntrc, setMdfeRntrc] = useState("")
    const [mdfeTipoEmitente, setMdfeTipoEmitente] = useState("1")
    const [mdfeTipoTransportador, setMdfeTipoTransportador] = useState("1")
    const [mdfeCondutores, setMdfeCondutores] = useState<{ nome: string; cpf: string }[]>([{ nome: "", cpf: "" }])
    const [mdfeChavesNfe, setMdfeChavesNfe] = useState<string[]>([""])
    const [mdfeMunicipioCarregamentoIbge, setMdfeMunicipioCarregamentoIbge] = useState("")
    const [mdfeMunicipioCarregamentoNome, setMdfeMunicipioCarregamentoNome] = useState("")
    const [mdfeValorCarga, setMdfeValorCarga] = useState("")
    const [mdfeProdutoPredominante, setMdfeProdutoPredominante] = useState("Peças automotivas")
    const [mdfeUnidadeMedida, setMdfeUnidadeMedida] = useState("04")
    const [mdfeQuantidade, setMdfeQuantidade] = useState("1")
    const [mdfeSerie, setMdfeSerie] = useState("1")
    const [mdfeInfoComplementares, setMdfeInfoComplementares] = useState("")
    const [mdfeBuscandoIbge, setMdfeBuscandoIbge] = useState(false)

    // Encerramento MDF-e
    const [isEncerramentoModalOpen, setIsEncerramentoModalOpen] = useState(false)
    const [selectedMdfeForEncerramento, setSelectedMdfeForEncerramento] = useState<any>(null)
    const [mdfeEncMunicipioIbge, setMdfeEncMunicipioIbge] = useState("")
    const [mdfeEncMunicipioNome, setMdfeEncMunicipioNome] = useState("")
    const [mdfeEncUf, setMdfeEncUf] = useState("")
    const [encerrando, setEncerrando] = useState(false)
    const [mdfeBuscandoIbgeEnc, setMdfeBuscandoIbgeEnc] = useState(false)

    // Cancelamento MDF-e
    const [isCancelMdfeModalOpen, setIsCancelMdfeModalOpen] = useState(false)
    const [selectedMdfeForCancel, setSelectedMdfeForCancel] = useState<any>(null)
    const [mdfeCancelJustificativa, setMdfeCancelJustificativa] = useState("")
    const [cancelandoMdfe, setCancelandoMdfe] = useState(false)

    // Frete
    const [modalidadeFrete, setModalidadeFrete] = useState("9") // 9 = Sem frete
    const [freteTransportadora, setFreteTransportadora] = useState("")
    const [freteCnpj, setFreteCnpj] = useState("")
    const [freteVeiculoPlaca, setFreteVeiculoPlaca] = useState("")
    const [freteValor, setFreteValor] = useState("")
    const [freteQtdVolumes, setFreteQtdVolumes] = useState("")
    const [freteEspecieVolumes, setFreteEspecieVolumes] = useState("")
    const [fretePesoBruto, setFretePesoBruto] = useState("")
    const [fretePesoLiquido, setFretePesoLiquido] = useState("")
    const [transportadoras, setTransportadoras] = useState<any[]>([])
    const [loadingTransportadoras, setLoadingTransportadoras] = useState(false)
    const [transportadoraSearchTerm, setTransportadoraSearchTerm] = useState("")
    const [debouncedTransportadoraSearchTerm, setDebouncedTransportadoraSearchTerm] = useState("")

    const [searchParams, setSearchParams] = useSearchParams()

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTransportadoraSearchTerm(transportadoraSearchTerm)
        }, 300)
        return () => clearTimeout(timer)
    }, [transportadoraSearchTerm])

    const fetchTransportadoras = async (term: string) => {
        setLoadingTransportadoras(true)
        try {
            const data = await configuracoesApi.listarTransportadoras(term)
            setTransportadoras(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error('[Fiscal] fetchTransportadoras:', e)
        } finally {
            setLoadingTransportadoras(false)
        }
    }

    useEffect(() => {
        if (isEmitModalOpen && emissaoStep === 3) {
            fetchTransportadoras(debouncedTransportadoraSearchTerm)
        }
    }, [isEmitModalOpen, emissaoStep, debouncedTransportadoraSearchTerm])

    const handleSelectTransportadora = (t: any) => {
        setFreteTransportadora(t.nome || t.razao_social || "")
        setFreteCnpj(t.documento || "")
        // Se houver placa ou outros dados, poderiam ser preenchidos aqui
        setTransportadoraSearchTerm("")
    }
    
    // Carta de Correção (CC-e)
    const [isCorrecaoModalOpen, setIsCorrecaoModalOpen] = useState(false)
    const [correcaoTexto, setCorrecaoTexto] = useState("")
    const [selectedNotaForCorrecao, setSelectedNotaForCorrecao] = useState<any>(null)
    const [enviandoCorrecao, setEnviandoCorrecao] = useState(false)
    const [correcaoResultado, setCorrecaoResultado] = useState<any>(null)

    const handleEnviarCorrecao = async () => {
        if (!selectedNotaForCorrecao || !correcaoTexto || correcaoTexto.trim().length < 15) {
            alert("O texto da correção deve ter no mínimo 15 caracteres.");
            return;
        }
        setEnviandoCorrecao(true);
        try {
            const token = getAuthToken()
            const api = getApiBaseUrl()
            const resp = await fetch(`${api}/api/fiscal/nfe/${selectedNotaForCorrecao.id}/correcao`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ texto: correcaoTexto })
            })
            const data = await resp.json()
            if (!resp.ok) {
                let msg = 'Erro ao enviar correção';
                if (data?.detail) {
                    if (typeof data.detail === 'string') msg = data.detail;
                    else if (data.detail.message) msg = data.detail.message;
                    else msg = JSON.stringify(data.detail);
                } else if (data?.error) {
                    msg = data.error;
                }
                throw new Error(msg);
            }
            
            setCorrecaoResultado(data.data || data);
            toast.success("Carta de correção autorizada!");
            await fetchNotas()
        } catch (e: any) {
            alert("Erro: " + e.message)
        } finally {
            setEnviandoCorrecao(false)
        }
    }

    // Cancelamento (Cancelamento NF-e)
    const [isCancelamentoModalOpen, setIsCancelamentoModalOpen] = useState(false)
    const [cancelamentoMotivo, setCancelamentoMotivo] = useState("")
    const [selectedNotaForCancelamento, setSelectedNotaForCancelamento] = useState<any>(null)
    const [cancelandoNota, setCancelandoNota] = useState(false)

    // Visualização (detalhes da nota)
    const [isNotaDetalhesOpen, setIsNotaDetalhesOpen] = useState(false)
    const [selectedNotaForDetalhes, setSelectedNotaForDetalhes] = useState<any>(null)

    const handleCancelarNota = async () => {
        if (!selectedNotaForCancelamento || cancelamentoMotivo.trim().length < 15) {
            alert("A justificativa deve ter no mínimo 15 caracteres.");
            return;
        }
        setCancelandoNota(true);
        try {
            const token = getAuthToken()
            const api = getApiBaseUrl()
            // Usa POST /cancelar — mais robusto que DELETE com body, pois alguns proxies/CDNs
            // (como Cloudflare) podem descartar o body em requisições DELETE.
            const resp = await fetch(`${api}/api/fiscal/nfe/${selectedNotaForCancelamento.id}/cancelar`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ justificativa: cancelamentoMotivo })
            })
            const data = await resp.json()
            if (!resp.ok) {
                let msg = 'Erro ao cancelar nota';
                if (data?.detail) {
                    if (typeof data.detail === 'string') msg = data.detail;
                    else if (data.detail.message) msg = data.detail.message;
                    else msg = JSON.stringify(data.detail);
                } else if (data?.error) {
                    msg = data.error;
                }
                throw new Error(msg);
            }
            
            alert("Cancelamento processado com sucesso!")
            
            setNotas(prev => prev.map(n => n.id === selectedNotaForCancelamento.id ? { 
                ...n, 
                status: 'Cancelada', 
                focus_status: data.data?.status || 'cancelado' 
            } : n))
            
            setIsCancelamentoModalOpen(false);
            setCancelamentoMotivo("");
            setSelectedNotaForCancelamento(null);
        } catch (e: any) {
            alert("Erro: " + e.message)
        } finally {
            setCancelandoNota(false)
        }
    }

    const lastPrefilledVendaIdRef = useRef<string | null>(null)
    const lastPrefilledDevolucaoIdRef = useRef<string | null>(null)

    useEffect(() => {
        fetchNotas()
        fetchInutilizacoes()
        fetchMdfes()
    }, [])

    useEffect(() => {
        setCurrentPage(1)
    }, [filterStatus, searchTerm, filterDataInicioList, filterDataFimList])

    useEffect(() => {
        const vendaIdFromUrl = searchParams.get("venda_id")
        if (!vendaIdFromUrl) return
        if (lastPrefilledVendaIdRef.current === vendaIdFromUrl) return
        lastPrefilledVendaIdRef.current = vendaIdFromUrl

        // Abre o modal imediatamente
        setLastFocusError(null)
        setIsEmitModalOpen(true)
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("venda_id")
            return next
        }, { replace: true })

        // Carrega lista de vendas e padrões fiscais ao abrir via URL
        // Define o selectedVendaId DEPOIS que as vendas forem carregadas para garantir que
        // o select consiga encontrar o item na lista e exibi-lo corretamente
        Promise.all([fetchVendasConcluidas(vendaIdFromUrl), fetchFiscalDefaults()])
            .then(() => {
                setSelectedVendaId(vendaIdFromUrl)
            })
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const devolucaoIdFromUrl = searchParams.get("devolucao_id")
        if (!devolucaoIdFromUrl) return
        if (lastPrefilledDevolucaoIdRef.current === devolucaoIdFromUrl) return
        lastPrefilledDevolucaoIdRef.current = devolucaoIdFromUrl

        // Abre o modal imediatamente
        setLastFocusError(null)
        setIsEmitModalOpen(true)
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.delete("devolucao_id")
            return next
        }, { replace: true })

        setEmissaoTipo('devolucao')
        Promise.all([
            devolucoesApi.listar({ limit: 200 }).then((data) => {
                setDevolucoesAprovadas(Array.isArray(data) ? data.filter((d: any) => d.status === 'Aprovado' || d.status === 'Concluido') : [])
            }),
            fetchFiscalDefaults()
        ]).then(() => {
            setSelectedDevolucaoId(devolucaoIdFromUrl)
        })
    }, [searchParams, setSearchParams])

    const fetchNotas = async () => {
        setLoading(true)
        try {
            const data = await fiscalApi.listarNotasFiscais({
                data_inicio: filterDataInicioList || undefined,
                data_fim: filterDataFimList || undefined
            })
            const parsed = (Array.isArray(data) ? data : []).map((n: any) => {
                let fp = n.focus_payload;
                if (typeof fp === 'string') {
                    try { fp = JSON.parse(fp); } catch(e) {}
                }
                let fr = n.focus_response;
                if (typeof fr === 'string') {
                    try { fr = JSON.parse(fr); } catch(e) {}
                }
                return { ...n, focus_payload: fp, focus_response: fr };
            });
            setNotas(parsed)
        } catch (e) {
            console.error('[Fiscal] fetchNotas:', e)
        } finally {
            setLoading(false)
        }
    }

    const notasFiltradas = useMemo(() => {
        return notas.filter((n: any) => {
            // ── Filtro por status ────────────────────────────────────────────
            if (filterStatus !== "Todas") {
                const isError = String(n.status || '').toLowerCase() === 'erro' ||
                               String(n.focus_status || '').toLowerCase().includes('erro') ||
                               String(n.focus_status || '').toLowerCase().includes('rejeitado');

                if (filterStatus === "Emitida" && (n.status !== "Emitida" || isError)) return false;
                if (filterStatus === "Erro" && !isError) return false;
                if (filterStatus === "Cancelada" && n.status !== "Cancelada") return false;
                if (filterStatus === "Pendente" && n.status !== "Pendente") return false;
            }

            // ── Filtro por data de emissão (frontend, complementar ao backend) ──
            if (filterDataInicioList || filterDataFimList) {
                const dataEmissao = (
                    n.data_emissao ||
                    n.focus_payload?.data_emissao ||
                    n.focus_response?.data_emissao ||
                    n.created_at ||
                    ''
                ).split('T')[0]

                if (filterDataInicioList && dataEmissao && dataEmissao < filterDataInicioList) return false
                if (filterDataFimList && dataEmissao && dataEmissao > filterDataFimList) return false
            }

            // ── Filtro por busca livre (fuzzy) ───────────────────────────────
            if (searchTerm.trim()) {
                const query = searchTerm.trim()

                // Número da nota — busca exata no número string
                const numero = String(n.numero_nota || '')
                if (normalizeStr(numero).includes(normalizeStr(query))) return true

                // Chave de acesso — busca literal
                const chave = String(n.chave_nfe || n.chave_acesso || '')
                if (chave.includes(query.replace(/\s/g, ''))) return true

                // Nome do destinatário / cliente — busca fuzzy
                const nomeDestinatario = String(
                    n.focus_payload?.destinatario?.nome ||
                    n.focus_response?.destinatario?.nome ||
                    n.clientes?.nome ||
                    ''
                )
                if (fuzzyMatch(nomeDestinatario, query)) return true

                // Emitente
                const nomeEmitente = String(n.focus_payload?.emitente?.nome || '')
                if (fuzzyMatch(nomeEmitente, query)) return true

                // Produtos / itens da nota — busca fuzzy em descrição e SKU/código
                const items: any[] = [
                    ...(n.focus_payload?.items || []),
                    ...(n.focus_payload?.itens || []),
                ]
                const matchesProduct = items.some((it: any) => {
                    const desc = String(it.descricao || it.descricao_produto || it.nome || '')
                    const sku  = String(it.codigo_produto || it.sku || it.codigo || '')
                    return fuzzyMatch(desc, query) || normalizeStr(sku).includes(normalizeStr(query))
                })
                if (matchesProduct) return true

                // Nenhum campo bateu — exclui a nota
                return false
            }

            return true
        })
    }, [notas, filterStatus, searchTerm, filterDataInicioList, filterDataFimList])

    const itemsPerPage = 20
    const paginatedNotas = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage
        return notasFiltradas.slice(startIndex, startIndex + itemsPerPage)
    }, [notasFiltradas, currentPage])

    const totalPages = useMemo(() => {
        return Math.ceil(notasFiltradas.length / itemsPerPage)
    }, [notasFiltradas])

    // ─── Funções MDF-e ─────────────────────────────────────────────────────────

    const fetchMdfes = async () => {
        setLoadingMdfes(true)
        try {
            const data = await mdfeApi.listar({
                data_inicio: mdfeFilterInicio || undefined,
                data_fim: mdfeFilterFim || undefined,
            })
            setMdfes(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error('[MDF-e] fetchMdfes:', e)
        } finally {
            setLoadingMdfes(false)
        }
    }

    const resetMdfeForm = () => {
        setMdfeStep(1)
        setMdfeUfInicio(""); setMdfeUfFim(""); setMdfePlaca(""); setMdfeUfVeiculo("")
        setMdfeRntrc(""); setMdfeTipoEmitente("1"); setMdfeTipoTransportador("1")
        setMdfeCondutores([{ nome: "", cpf: "" }])
        setMdfeChavesNfe([""])
        setMdfeMunicipioCarregamentoIbge(""); setMdfeMunicipioCarregamentoNome("")
        setMdfeValorCarga(""); setMdfeProdutoPredominante("Peças automotivas")
        setMdfeUnidadeMedida("04"); setMdfeQuantidade("1")
        setMdfeSerie("1"); setMdfeInfoComplementares("")
    }

    const handleBuscarIbgeMdfe = async (cidade: string, uf: string) => {
        if (!cidade || !uf) return
        setMdfeBuscandoIbge(true)
        try {
            const token = getAuthToken()
            const base = getApiBaseUrl()
            const resp = await fetch(`${base}/api/fiscal/ibge/codigo?cidade=${encodeURIComponent(cidade)}&uf=${encodeURIComponent(uf)}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (resp.ok) {
                const d = await resp.json()
                if (d.codigo_ibge) setMdfeMunicipioCarregamentoIbge(String(d.codigo_ibge))
            }
        } catch (e) { console.error('[MDF-e] buscar IBGE:', e) }
        finally { setMdfeBuscandoIbge(false) }
    }

    const handleBuscarIbgeMdfeEnc = async (cidade: string, uf: string) => {
        if (!cidade || !uf) return
        setMdfeBuscandoIbgeEnc(true)
        try {
            const token = getAuthToken()
            const base = getApiBaseUrl()
            const resp = await fetch(`${base}/api/fiscal/ibge/codigo?cidade=${encodeURIComponent(cidade)}&uf=${encodeURIComponent(uf)}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (resp.ok) {
                const d = await resp.json()
                if (d.codigo_ibge) setMdfeEncMunicipioIbge(String(d.codigo_ibge))
            }
        } catch (e) { console.error('[MDF-e] buscar IBGE enc:', e) }
        finally { setMdfeBuscandoIbgeEnc(false) }
    }

    const handleEmitirMdfe = async () => {
        setEmittingMdfe(true)
        try {
            const condutoresValidos = mdfeCondutores.filter(c => c.nome.trim() && c.cpf.replace(/\D/g, '').length === 11)
            const chavesValidas = mdfeChavesNfe.map(c => c.trim()).filter(c => c.length === 44)

            const payload = {
                ambiente: "producao",
                uf_inicio: mdfeUfInicio.toUpperCase(),
                uf_fim: mdfeUfFim.toUpperCase(),
                municipio_carregamento_ibge: mdfeMunicipioCarregamentoIbge,
                municipio_carregamento_nome: mdfeMunicipioCarregamentoNome,
                placa_veiculo: mdfePlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                uf_veiculo: mdfeUfVeiculo.toUpperCase(),
                rntrc: mdfeRntrc || null,
                tipo_emitente: mdfeTipoEmitente,
                tipo_transportador: mdfeTipoTransportador,
                condutores: condutoresValidos,
                chaves_nfe: chavesValidas,
                valor_total_carga: parseFloat(mdfeValorCarga) || 0,
                produto_predominante: mdfeProdutoPredominante,
                unidade_medida_carga: mdfeUnidadeMedida,
                quantidade_carga: parseFloat(mdfeQuantidade) || 1,
                serie: mdfeSerie,
                informacoes_complementares: mdfeInfoComplementares || null,
            }

            await mdfeApi.emitir(payload)
            toast.success("MDF-e enviado para processamento com sucesso!")
            setIsMdfeModalOpen(false)
            resetMdfeForm()
            await fetchMdfes()
        } catch (e: any) {
            const detail = e?.response?.data?.detail || e?.detail
            const msg = (typeof detail === 'object' ? detail?.message : detail) || e?.message || String(e)
            toast.error("Erro ao emitir MDF-e: " + msg)
        } finally {
            setEmittingMdfe(false)
        }
    }

    const handleRefreshMdfe = async (id: string) => {
        try {
            await mdfeApi.refresh(id)
            await fetchMdfes()
            toast.success("Status atualizado")
        } catch (e: any) {
            toast.error("Erro ao atualizar: " + (e?.message || e))
        }
    }

    const handleCancelarMdfe = async () => {
        if (!selectedMdfeForCancel || mdfeCancelJustificativa.trim().length < 15) {
            toast.error("Justificativa deve ter no mínimo 15 caracteres")
            return
        }
        setCancelandoMdfe(true)
        try {
            await mdfeApi.cancelar(selectedMdfeForCancel.id, mdfeCancelJustificativa)
            toast.success("MDF-e cancelado com sucesso")
            setIsCancelMdfeModalOpen(false)
            setMdfeCancelJustificativa("")
            setSelectedMdfeForCancel(null)
            await fetchMdfes()
        } catch (e: any) {
            toast.error("Erro ao cancelar: " + (e?.message || e))
        } finally {
            setCancelandoMdfe(false)
        }
    }

    const handleEncerrarMdfe = async () => {
        if (!selectedMdfeForEncerramento || !mdfeEncMunicipioIbge || !mdfeEncUf) {
            toast.error("Preencha o município e UF de encerramento")
            return
        }
        setEncerrando(true)
        try {
            await mdfeApi.encerrar(selectedMdfeForEncerramento.id, {
                municipio_encerramento_ibge: mdfeEncMunicipioIbge,
                municipio_encerramento_nome: mdfeEncMunicipioNome || undefined,
                uf_encerramento: mdfeEncUf.toUpperCase(),
            })
            toast.success("MDF-e encerrado com sucesso")
            setIsEncerramentoModalOpen(false)
            setSelectedMdfeForEncerramento(null)
            setMdfeEncMunicipioIbge(""); setMdfeEncMunicipioNome(""); setMdfeEncUf("")
            await fetchMdfes()
        } catch (e: any) {
            toast.error("Erro ao encerrar: " + (e?.message || e))
        } finally {
            setEncerrando(false)
        }
    }

    const getMdfeStatusColor = (status: string) => {
        switch (status) {
            case 'Emitido':    return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            case 'Encerrado':  return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
            case 'Cancelado':  return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
            case 'Pendente':   return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            default:           return 'bg-primary/10 text-primary border-primary/20'
        }
    }

    const fetchInutilizacoes = async (opts?: { refresh?: boolean }) => {
        setLoadingInutilizacoes(true)
        try {
            const token = getAuthToken()
            if (!token) throw new Error('Sessão expirada. Faça login novamente.')

            const api = getApiBaseUrl()
            const params = new URLSearchParams();
            params.append('ambiente', ambiente);
            if (opts?.refresh) params.append('refresh', '1');
            const url = `${api}/api/fiscal/nfe/inutilizacoes?${params.toString()}`;
            const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            const body = await resp.json().catch(() => ({}))
            if (!resp.ok) {
                const msg =
                    (typeof body?.detail === 'string' ? body.detail : null) ||
                    body?.error ||
                    body?.message ||
                    'Falha ao consultar inutilizações.'
                throw new Error(msg)
            }
            setInutilizacoes(body?.inutilizacoes || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingInutilizacoes(false)
        }
    }

    const resetInutilizacaoForm = () => {
        setInutilNumeroInicial("")
        setInutilNumeroFinal("")
        setInutilJustificativa("")
        setInutilSerie("1")
        setInutilAno(String(new Date().getFullYear()))
        setInutilConfirmChecked(false)
        setInutilConfirmText("")
    }

    const openInutilizacaoFromNota = async (nota: any) => {
        // Abre o modal já contextualizado pela nota (série/ano e numeração, quando disponível)
        resetInutilizacaoForm()

        const serie = nota?.serie != null ? String(nota.serie) : "1"
        const createdAt = nota?.created_at ? new Date(nota.created_at) : new Date()
        const ano = String(createdAt.getFullYear())

        setInutilSerie(serie)
        setInutilAno(ano)

        const num = nota?.numero_nota != null && String(nota.numero_nota).trim() !== "" ? String(nota.numero_nota) : ""
        if (num) {
            setInutilNumeroInicial(num)
            setInutilNumeroFinal(num)
        }

        await fetchInutilizacoes()
        setLastFocusError(null)
        setIsInutilizacaoModalOpen(true)
    }

    const handleInutilizarNumeracao = async () => {
        if (inutilJustificativa.trim().length < 15) {
            alert("A justificativa deve ter no mínimo 15 caracteres (exigência SEFAZ).")
            return
        }
        if (!inutilConfirmChecked || inutilConfirmText.trim().toUpperCase() !== "INUTILIZAR") {
            alert('Confirme a operação marcando a caixa e digitando \"INUTILIZAR\".')
            return
        }

        setInutilizando(true)
        try {
            const token = getAuthToken()
            if (!token) throw new Error('Sessão expirada. Faça login novamente.')

            const api = getApiBaseUrl()
            const resp = await fetch(`${api}/api/fiscal/nfe/inutilizar`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    numero_inicial: Number(inutilNumeroInicial),
                    numero_final: Number(inutilNumeroFinal),
                    justificativa: inutilJustificativa,
                    serie: inutilSerie,
                    ano: Number(inutilAno),
                    ambiente: "producao",
                }),
            })
            const body = await resp.json().catch(() => ({}))
            if (!resp.ok) {
                let msg = 'Falha ao inutilizar numeração.';
                if (body?.detail) {
                    if (typeof body.detail === 'string') msg = body.detail;
                    else if (body.detail.message) msg = body.detail.message;
                    else msg = JSON.stringify(body.detail);
                } else if (body?.error) {
                    msg = body.error;
                } else if (body?.message) {
                    msg = body.message;
                }
                const error: any = new Error(msg);
                if (body?.detail?.focus_error) error.focus_error = body.detail.focus_error;
                throw error;
            }

            alert(body?.message || "Inutilização registrada com sucesso.")
            setIsInutilizacaoModalOpen(false)
            resetInutilizacaoForm()
            await fetchInutilizacoes()
        } catch (e: any) {
            if (e.focus_error) {
                setLastFocusError(e.focus_error);
            }
            alert("Erro: " + (e?.message || e))
        } finally {
            setInutilizando(false)
        }
    }

    const fetchVendasConcluidas = async (preselectedId?: string) => {
        setLoadingVendas(true)
        try {
            const statusValidos = ['Pago', 'Enviado', 'Entregue', 'Pagamento Parcial', 'Boleto a Receber', 'A Receber', 'Concluída']
            let lista: any[] = await vendasApi.listar({
                status_in: statusValidos.join(','),
                limit: 500,
            })
            if (!Array.isArray(lista)) lista = []

            if (preselectedId && !lista.some((v) => v.id === preselectedId)) {
                try {
                    const vendaExtra = await vendasApi.detalheCompleto(preselectedId)
                    const { itens = [], ...rest } = vendaExtra
                    lista = [{ ...rest, vendas_itens: itens }, ...lista]
                } catch (err) {
                    console.error('[Fiscal] venda pré-selecionada não encontrada:', err)
                }
            }

            setVendasConcluidas(lista)
        } catch (e) {
            console.error('[Fiscal] fetchVendasConcluidas falhou:', e)
        } finally {
            setLoadingVendas(false)
        }
    }

    const handleTryCloseEmitModal = () => {
        setIsClosingEmitModalConfirmationOpen(true);
    };

    const handleConfirmCloseEmitModal = () => {
        setIsEmitModalOpen(false);
        setIsClosingEmitModalConfirmationOpen(false);
        setSelectedVendaId("");
        setEmissaoStep(1);
        setEmissaoTipo('vincular');
        setManualItens([]);
        setSelectedClienteId("");
        setSelectedDevolucaoId("");
        setSelectedFornecedorId("");
        setChaveReferenciada("");
        setFornecedorSearch("");
        setFreteQtdVolumes("");
        setFreteEspecieVolumes("");
        setFretePesoBruto("");
        setFretePesoLiquido("");
    };

    const fetchFiscalDefaults = async () => {
        try {
            const data = await configuracoesApi.obter()
            if (!data) return
            setCfopPadrao(data.fiscal_cfop_padrao || "5405")
            setCstPadrao(normalizeCsosnStored(data.fiscal_cst_padrao as string))
            setNcmPadrao(data.fiscal_ncm_padrao || "00000000")
            const infoComp =
                (data.fiscal_informacoes_complementares as string | undefined) ||
                (data.fiscal_info_complementar_padrao as string | undefined) ||
                ""
            setInformacoesComplementares(infoComp)
            setIcmsOrigemPadrao(String(data.fiscal_icms_origem ?? "0"))
            setPisSituacaoPadrao(String(data.fiscal_pis_situacao ?? "49"))
            setCofinsSituacaoPadrao(String(data.fiscal_cofins_situacao ?? "49"))
            setRegimeTributarioPadrao(String(data.fiscal_regime_tributario ?? "1"))
        } catch (e) {
            console.error('[Fiscal] fetchFiscalDefaults:', e)
        }
    }

    const padroesFiscaisPayload = () => ({
        cfop: cfopPadrao,
        cst: cstPadrao,
        ncm: ncmPadrao,
        icms_origem: icmsOrigemPadrao,
        pis_situacao: pisSituacaoPadrao,
        cofins_situacao: cofinsSituacaoPadrao,
        regime_tributario: regimeTributarioPadrao,
    })

    const handleEmitirNota = async () => {
        if (emissaoTipo === 'vincular' && !selectedVendaId) return;
        if (emissaoTipo === 'avulsa' && !selectedClienteId) return;
        if (emissaoTipo === 'devolucao' && !selectedDevolucaoId) return;
        if ((emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') && !selectedFornecedorId) return;
        
        setEmitting(true)
        setValidationErrors([])
        setLastFocusError(null)

        try {
            const token = getAuthToken()
            if (!token) throw new Error('Sessão expirada. Faça login novamente.')

            const api = getApiBaseUrl()

            // Validação pré-emissão
            setValidando(true)
            const clienteIdFinal = emissaoTipo === 'avulsa' 
                ? selectedClienteId 
                : emissaoTipo === 'devolucao'
                    ? devolucaoSelecionadaObj?.cliente_id
                    : emissaoTipo === 'vincular'
                        ? (vendaSelecionadaObj?.cliente_id || null)
                        : null;

            const manualItensPayload = (emissaoTipo === 'avulsa' || emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') ? manualItens : null;

            const respValidate = await fetch(`${api}/api/fiscal/nfe/validate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    emissao_tipo: emissaoTipo,
                    venda_id: emissaoTipo === 'vincular' ? selectedVendaId : null,
                    cliente_id: clienteIdFinal,
                    manual_itens: manualItensPayload,
                    devolucao_id: emissaoTipo === 'devolucao' ? selectedDevolucaoId : null,
                    fornecedor_id: (emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') ? selectedFornecedorId : null,
                    padroes_fiscais: padroesFiscaisPayload(),
                    codigo_ibge_destinatario: codigoIbgeDestinatario || null,
                    itens_fiscal_overrides: itensFiscalOverrides,
                }),
            })
            const validateBody = await respValidate.json().catch(() => ({}))
            if (!respValidate.ok) {
                throw new Error(validateBody?.error || 'Falha na validação da NF-e.')
            }
            if (!validateBody?.ok) {
                const errs = Array.isArray(validateBody?.errors) ? validateBody.errors : ['Dados incompletos para emissão da NF-e.']
                setValidationErrors(errs)
                return
            }
            setValidando(false)

            const resp = await fetch(`${api}/api/fiscal/nfe/emit`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    emissao_tipo: emissaoTipo,
                    venda_id: emissaoTipo === 'vincular' ? selectedVendaId : null,
                    cliente_id: clienteIdFinal,
                    manual_itens: manualItensPayload,
                    devolucao_id: emissaoTipo === 'devolucao' ? selectedDevolucaoId : null,
                    fornecedor_id: (emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') ? selectedFornecedorId : null,
                    chave_referenciada: chaveReferenciada,
                    tipo_documento: emissaoTipo === 'entrada_compra' ? 0 : tipoDocumento,
                    adicionar_ao_estoque: adicionarAoEstoque,
                    ambiente: ambiente,
                    padroes_fiscais: padroesFiscaisPayload(),
                    informacoes_complementares: informacoesComplementares?.trim() || null,
                    codigo_ibge_destinatario: codigoIbgeDestinatario || null,
                    itens_fiscal_overrides: itensFiscalOverrides,
                    frete: {
                        modalidade_frete: modalidadeFrete,
                        transportadora: freteTransportadora.trim() || null,
                        cnpj_transportadora: freteCnpj.replace(/\D/g, '') || null,
                        placa_veiculo: freteVeiculoPlaca.trim() || null,
                        valor_frete: freteValor ? Number(freteValor) : null,
                        qtd_volumes: freteQtdVolumes ? Number(freteQtdVolumes) : null,
                        especie_volumes: freteEspecieVolumes.trim() || null,
                        peso_bruto: fretePesoBruto ? Number(fretePesoBruto.replace(',', '.')) : null,
                        peso_liquido: fretePesoLiquido ? Number(fretePesoLiquido.replace(',', '.')) : null,
                    },
                }),
            })
            const body = await resp.json().catch(() => ({}))
            if (!resp.ok) {
                let msg = 'Falha ao emitir NF-e.';
                if (body?.detail) {
                    if (typeof body.detail === 'string') msg = body.detail;
                    else if (body.detail.message) msg = body.detail.message;
                    else msg = JSON.stringify(body.detail);
                } else if (body?.error) {
                    msg = body.error;
                } else if (body?.mensagem) {
                    msg = body.mensagem;
                }
                const error: any = new Error(msg);
                if (body?.detail?.focus_error) error.focus_error = body.detail.focus_error;
                throw error;
            }

            // Focus pode retornar HTTP 200 mas com status de erro (rejeição SEFAZ)
            const notaStatus = body?.nota?.status as string | undefined;
            const isErro = notaStatus && notaStatus !== 'Emitida' && notaStatus !== 'Pendente';

            if (isErro) {
                const errMsg = body?.nota?.mensagem_status || body?.message || 'NF-e rejeitada.';
                if (body?.detail?.focus_error) setLastFocusError(body.detail.focus_error);
                toast.error(`NF-e com erro: ${errMsg}`, { duration: 8000 });
                await fetchNotas();
                return;
            }

            toast.success(body?.message || 'NF-e enviada com sucesso!')
            setIsEmitModalOpen(false)
            setLastFocusError(null)
            setSelectedVendaId("")
            setSelectedClienteId("")
            setSelectedDevolucaoId("")
            setSelectedFornecedorId("")
            setChaveReferenciada("")
            setManualItens([])
            await fetchNotas()
        } catch (err: any) {
            if (validationErrors.length > 0 && String(err?.message || '').includes('Emissão bloqueada')) return

            if (err.focus_error) {
                setLastFocusError(err.focus_error);
            }

            toast.error('Erro ao emitir nota: ' + (err?.message || err), { duration: 8000 })
            // Atualiza a lista — o backend pode ter salvo a nota com status de erro
            await fetchNotas()
        } finally {
            setEmitting(false)
            setValidando(false)
        }
    }

    const handleSearchNcm = async () => {
        if (!ncmSearchQuery || ncmSearchQuery.length < 3) return
        setSearchingNcm(true)
        try {
            const token = getAuthToken()
            const api = getApiBaseUrl()
            const resp = await fetch(`${api}/api/fiscal/ncm/search?query=${encodeURIComponent(ncmSearchQuery)}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await resp.json()
            setNcmSearchResults(Array.isArray(data) ? data : [])
        } catch (e) {
            console.error('Erro ao buscar NCM:', e)
        } finally {
            setSearchingNcm(false)
        }
    }

    const nextStep = () => {
        setValidationErrors([]);
        
        if (emissaoStep === 1) {
            if (emissaoTipo === 'vincular' && !selectedVendaId) {
                alert("Por favor, selecione uma venda para continuar.");
                return;
            }
            if (emissaoTipo === 'avulsa' && !selectedClienteId) {
                alert("Por favor, selecione um cliente para continuar.");
                return;
            }
            if (emissaoTipo === 'devolucao') {
                if (!selectedDevolucaoId) {
                    alert("Por favor, selecione uma devolução para continuar.");
                    return;
                }
                if (!chaveReferenciada || chaveReferenciada.length !== 44) {
                    alert("A chave de acesso referenciada de 44 dígitos é obrigatória para devoluções.");
                    return;
                }
            }
            if (emissaoTipo === 'devolucao_compra') {
                if (!selectedFornecedorId) {
                    alert("Por favor, selecione um fornecedor para continuar.");
                    return;
                }
                if (!chaveReferenciada || chaveReferenciada.length !== 44) {
                    alert("A chave de acesso referenciada de 44 dígitos é obrigatória para devoluções.");
                    return;
                }
            }
        }

        if (emissaoStep === 2) {
            const isSupplier = emissaoTipo === 'devolucao_compra';
            const c = emissaoTipo === 'vincular' 
                ? vendaSelecionadaObj?.clientes 
                : emissaoTipo === 'avulsa' 
                    ? clienteSelecionadoManual 
                    : emissaoTipo === 'devolucao'
                        ? devolucaoSelecionadaObj?.clientes
                        : fornecedorSelecionadoObj;
            const cid = emissaoTipo === 'vincular' 
                ? vendaSelecionadaObj?.cliente_id 
                : emissaoTipo === 'avulsa' 
                    ? selectedClienteId 
                    : emissaoTipo === 'devolucao'
                        ? devolucaoSelecionadaObj?.cliente_id
                        : selectedFornecedorId;
            const errors: string[] = [];
            
            if (!cid) errors.push(isSupplier ? "Fornecedor não selecionado ou identificador ausente." : "Cliente não selecionado ou identificador ausente.");
            const doc = c?.cnpj || c?.documento;
            if (!doc) errors.push(isSupplier ? "Fornecedor sem CNPJ/CPF." : "Cliente sem CPF/CNPJ.");
            const enderecoVal = c?.endereco || (c?.endereco_logradouro && c?.endereco_cidade);
            if (!enderecoVal) errors.push(isSupplier ? "Endereço do fornecedor incompleto." : "Endereço do cliente incompleto.");
            if (!codigoIbgeDestinatario) errors.push("Código IBGE do município é obrigatório.");
            
            if (errors.length > 0) {
                setValidationErrors(errors);
                alert("Pendências no Destinatário:\n\n- " + errors.join("\n- ") + "\n\nPor favor, complete os dados antes de prosseguir.");
                return;
            }
        }
        
        if (emissaoStep === 3) {
            const itemNome = emissaoTipo === 'vincular' 
                ? itensVendaSelecionada[0]?.produtos?.nome 
                : manualItens[0]?.nome;
            if (itemNome) handleAutoSuggestNCM(itemNome);
        }
        
        setEmissaoStep(prev => Math.min(prev + 1, 5));
    }

    const prevStep = () => {
        setValidationErrors([]);
        setEmissaoStep(prev => Math.max(prev - 1, 1));
    }

    const handleAtualizarStatus = async (notaId: string) => {
        try {
            const token = getAuthToken()
            if (!token) throw new Error('Sessão expirada. Faça login novamente.')
            const api = getApiBaseUrl()
            const resp = await fetch(`${api}/api/fiscal/nfe/${notaId}/refresh`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            })
            const body = await resp.json().catch(() => ({}))
            if (!resp.ok) throw new Error(body?.error || 'Falha ao atualizar status.')
            await fetchNotas()
        } catch (err: any) {
            alert("Erro ao atualizar status: " + err.message)
        }
    }

    const getStatusColor = (status: string, focusStatus?: string) => {
        const fs = String(focusStatus || '').toLowerCase()
        if (status === 'Erro' || fs.includes('erro') || fs.includes('rejeitado')) {
            return 'bg-rose-500/10 text-rose-500 border-rose-500/20'
        }
        switch (status) {
            case 'Emitida': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            case 'Pendente': return 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            case 'Cancelada': return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
            default: return 'bg-primary/10 text-primary border-primary/20'
        }
    }

    // --- Filtragem avançada das vendas no modal ---
    const vendasFiltradas = useMemo(() => {
        return vendasConcluidas.filter((v: any) => {
            // Filtro por texto livre: nº pedido, cliente, produto, SKU
            const termo = vendaSearchTerm.trim().toLowerCase()
            if (termo) {
                const pedido = String(v.numero_pedido ?? '').padStart(6, '0').toLowerCase()
                const cliente = String(v.clientes?.nome ?? '').toLowerCase()
                const itens: any[] = Array.isArray(v.vendas_itens) ? v.vendas_itens : []
                const matchProduto = itens.some((i: any) =>
                    String(i.produtos?.nome ?? '').toLowerCase().includes(termo) ||
                    String(i.produtos?.sku ?? '').toLowerCase().includes(termo)
                )
                const matchTexto =
                    pedido.includes(termo) ||
                    cliente.includes(termo) ||
                    matchProduto
                if (!matchTexto) return false
            }

            // Filtro por data de criação
            const dataVenda = (v.data_venda || v.created_at || '').split('T')[0]
            if (filterDataInicio && dataVenda < filterDataInicio) return false
            if (filterDataFim && dataVenda > filterDataFim) return false

            return true
        })
    }, [vendasConcluidas, vendaSearchTerm, filterDataInicio, filterDataFim])

    const vendaSelecionadaObj = useMemo(() => {
        if (!selectedVendaId) return null
        return vendasConcluidas.find((v: any) => v.id === selectedVendaId) || null
    }, [vendasConcluidas, selectedVendaId])

    // --- Hooks de Automação e Busca (Reposicionados para evitar TDZ) ---

    // Debounce para Busca de NCM
    useEffect(() => {
        if (!ncmSearchQuery || ncmSearchQuery.trim().length < 3) {
            setNcmSearchResults([]);
            return;
        }
        const delaySearch = setTimeout(() => {
            handleSearchNcm();
        }, 500);
        return () => clearTimeout(delaySearch);
    }, [ncmSearchQuery]);

    // Automação de NCM/CEST baseado em nomes (Conforme solicitado pelo usuário)
    useEffect(() => {
        if (emissaoTipo === 'vincular' && vendaSelecionadaObj?.vendas_itens) {
            const overrides: Record<string, { ncm: string, cest?: string }> = {};
            vendaSelecionadaObj.vendas_itens.forEach((it: any) => {
                const name = it.prod_nome || it.nome || it.produtos?.nome || '';
                const suggestion = suggestFiscalInfo(name);
                if (suggestion) {
                    overrides[String(it.id)] = {
                        ncm: suggestion.ncm.replace(/\./g, ''), // Remove pontos para o padrão focus
                        cest: suggestion.cest.replace(/\./g, '')
                    };
                }
                // Fallback: se o produto não tem NCM próprio e a categoria tem ncm_padrao, usa o da categoria
                else if (!it.prod_ncm && it.produtos?.categorias) {
                    const catNcm = it.produtos.categorias?.ncm_padrao;
                    const catCest = it.produtos.categorias?.cest_padrao;
                    if (catNcm) {
                        overrides[String(it.id)] = {
                            ncm: catNcm.replace(/\D/g, ''),
                            ...(catCest ? { cest: catCest.replace(/\./g, '') } : {})
                        };
                    }
                }
            });
            if (Object.keys(overrides).length > 0) {
                setItensFiscalOverrides(prev => ({ ...prev, ...overrides }));
            }
        }
    }, [vendaSelecionadaObj, emissaoTipo]);

    const handleAutoSuggestNCM = async (query: string) => {
        if (!query || query.trim().length < 3) return;
        setLoadingSuggestions(true);
        try {
            const token = getAuthToken();
            const apiBase = getApiBaseUrl();
            const resp = await fetch(`${apiBase}/api/fiscal/ncm/suggest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ query })
            });
            if (resp.ok) {
                const data = await resp.json();
                setNcmSuggestions(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.warn('[Fiscal] erro ao sugerir NCM:', e);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Auto-fill Código IBGE Destinatário
    useEffect(() => {
        const cli = emissaoTipo === 'vincular' 
            ? vendaSelecionadaObj?.clientes 
            : emissaoTipo === 'avulsa' 
                ? clienteSelecionadoManual 
                : emissaoTipo === 'devolucao'
                    ? devolucaoSelecionadaObj?.clientes
                    : fornecedorSelecionadoObj;
        const cidade = cli?.endereco_cidade || cli?.cidade;
        const uf = cli?.endereco_uf || cli?.uf || cli?.estado || cli?.cidade;
        
        let cepRaw = cli?.cep || '';
        // Fallback: Tenta extrair do endereço se o campo CEP estiver vazio
        if (!cepRaw && cli?.endereco) {
            const match = cli.endereco.match(/\d{5}-?\d{3}/);
            if (match) cepRaw = match[0];
        }
        
        const cep = cepRaw.replace(/\D/g, '');

        if (emissaoStep === 2 && (cep.length === 8 || (cidade && uf))) {
            if (loadingIbge) return;
            // Evita loop se já tivermos um código e for o mesmo do cliente
            if (cli?.codigo_ibge && String(cli.codigo_ibge) === codigoIbgeDestinatario) return;
            // Se já buscamos e o código está preenchido, não busca de novo a menos que o cliente mude
            if (codigoIbgeDestinatario && cli?.id === lastFetchedCliId.current) return;

            const fetchIbge = async () => {
                setLoadingIbge(true);
                lastFetchedCliId.current = cli?.id;
                try {
                    const token = getAuthToken();
                    const api = getApiBaseUrl();
                    let url = `${api}/api/fiscal/ibge/codigo?`;
                    if (cep.length === 8) url += `cep=${cep}`;
                    else url += `cidade=${encodeURIComponent(cidade)}&uf=${encodeURIComponent(uf)}`;

                    const resp = await fetch(url, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        const finalCode = data.codigo_ibge || data.codigo;
                        if (finalCode) setCodigoIbgeDestinatario(String(finalCode));
                    }
                } catch (e) {
                    console.error("Erro ao buscar IBGE:", e);
                } finally {
                    setLoadingIbge(false);
                }
            };
            fetchIbge();
        }
    }, [vendaSelecionadaObj?.clientes, clienteSelecionadoManual, emissaoTipo, emissaoStep]);

    const lastFetchedCliId = useRef<string | null>(null);

    // Garante que a venda pré-selecionada sempre apareça na lista, mesmo fora do filtro
    const vendasOptions = useMemo(() => {
        if (!vendaSelecionadaObj) return vendasFiltradas
        if (vendasFiltradas.some((v: any) => v.id === vendaSelecionadaObj.id)) return vendasFiltradas
        return [vendaSelecionadaObj, ...vendasFiltradas]
    }, [vendaSelecionadaObj, vendasFiltradas])

    // Resumo dos itens da venda selecionada
    const itensVendaSelecionada = useMemo(() => {
        if (!vendaSelecionadaObj) return []
        return Array.isArray(vendaSelecionadaObj.vendas_itens)
            ? vendaSelecionadaObj.vendas_itens
            : []
    }, [vendaSelecionadaObj])

    const limparFiltrosModal = () => {
        setVendaSearchTerm("")
        setFilterDataInicio("")
        setFilterDataFim("")
    }

    const temFiltroAtivo = vendaSearchTerm || filterDataInicio || filterDataFim

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter text-foreground">Módulo <span className="text-primary-foreground bg-primary px-2 rounded-lg">Fiscal</span></h1>
                    <p className="text-muted-foreground">Gestão de NF-e, MDF-e e documentos fiscais.</p>
                </div>
                {activeMainTab === 'nfe' ? (
                    <Button
                        className="font-bold bg-primary text-primary-foreground shadow-sm"
                        onClick={() => {
                            setIsEmitModalOpen(true)
                            fetchVendasConcluidas()
                            fetchFiscalDefaults()
                        }}
                    >
                        <Plus className="w-4 h-4 mr-2" /> Emitir NF-e
                    </Button>
                ) : (
                    <Button
                        className="font-bold bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                        onClick={() => { resetMdfeForm(); setIsMdfeModalOpen(true) }}
                    >
                        <Truck className="w-4 h-4 mr-2" /> Emitir MDF-e
                    </Button>
                )}
            </div>

            {/* Tabs NF-e / MDF-e */}
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit border border-border/50">
                <button
                    onClick={() => setActiveMainTab('nfe')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all",
                        activeMainTab === 'nfe'
                            ? "bg-white dark:bg-card shadow text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <FileText className="w-4 h-4" /> NF-e
                </button>
                <button
                    onClick={() => { setActiveMainTab('mdfe'); fetchMdfes() }}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all",
                        activeMainTab === 'mdfe'
                            ? "bg-white dark:bg-card shadow text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Truck className="w-4 h-4" /> MDF-e
                </button>
            </div>

            {activeMainTab === 'nfe' && <>

            {/* ── Barra de filtros NF-e ──────────────────────────────────────── */}
            <div className="flex flex-col gap-3 mb-2">
                {/* Linha 1: busca livre + status */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nº, chave, destinatário ou produto (aceita erros de digitação, acentos, ordem de palavras)…"
                            className="pl-10 h-10 text-sm"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value)
                                setCurrentPage(1)
                            }}
                        />
                        {searchTerm && (
                            <button
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => { setSearchTerm(''); setCurrentPage(1) }}
                                title="Limpar busca"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Tabs de status */}
                    <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50 shrink-0">
                        {([
                            { key: 'Emitida',   label: 'Emitidas',   color: 'text-emerald-600' },
                            { key: 'Cancelada', label: 'Canceladas', color: 'text-slate-500' },
                            { key: 'Erro',      label: 'Erros',      color: 'text-rose-600' },
                            { key: 'Pendente',  label: 'Pendentes',  color: 'text-amber-600' },
                            { key: 'Todas',     label: 'Todas',      color: 'text-primary' },
                        ] as const).map(({ key, label, color }) => (
                            <button
                                key={key}
                                onClick={() => { setFilterStatus(key); setCurrentPage(1) }}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                    filterStatus === key
                                        ? `bg-background shadow-sm ${color}`
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Linha 2: datas + botões */}
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/50">
                        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Emissão de</span>
                        <Input
                            type="date"
                            className="h-8 border-0 bg-transparent focus-visible:ring-0 w-32 p-0 text-xs"
                            value={filterDataInicioList}
                            onChange={(e) => { setFilterDataInicioList(e.target.value); setCurrentPage(1) }}
                        />
                        <span className="text-muted-foreground text-[10px] font-bold">ATÉ</span>
                        <Input
                            type="date"
                            className="h-8 border-0 bg-transparent focus-visible:ring-0 w-32 p-0 text-xs"
                            value={filterDataFimList}
                            onChange={(e) => { setFilterDataFimList(e.target.value); setCurrentPage(1) }}
                        />
                        {(filterDataInicioList || filterDataFimList) && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                    setFilterDataInicioList("")
                                    setFilterDataFimList("")
                                    setCurrentPage(1)
                                    fiscalApi.listarNotasFiscais().then(data => {
                                        setNotas(Array.isArray(data) ? data : [])
                                    })
                                }}
                            >
                                <X className="w-3 h-3" />
                            </Button>
                        )}
                    </div>

                    <Button
                        variant="secondary"
                        size="sm"
                        className="font-bold h-9 px-4"
                        onClick={fetchNotas}
                    >
                        <Filter className="w-4 h-4 mr-2" /> Filtrar datas
                    </Button>

                    {/* Badge de resultados e limpar tudo */}
                    {(searchTerm || filterDataInicioList || filterDataFimList || filterStatus !== 'Emitida') && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                <span className="font-bold text-foreground">{notasFiltradas.length}</span> resultado{notasFiltradas.length !== 1 ? 's' : ''}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                    setSearchTerm('')
                                    setFilterStatus('Emitida')
                                    setFilterDataInicioList('')
                                    setFilterDataFimList('')
                                    setCurrentPage(1)
                                }}
                            >
                                <X className="w-3 h-3 mr-1" /> Limpar filtros
                            </Button>
                        </div>
                    )}
                    
                    {/* Exportar PDF — sempre visível no canto direito */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="font-bold h-9 px-4 text-emerald-600 border-emerald-600/20 hover:bg-emerald-50 ml-auto"
                        onClick={async () => {
                            try {
                                const notasParaExportar = notasFiltradas.filter(n => {
                                    const isError = String(n.status || '').toLowerCase() === 'erro' ||
                                                   String(n.focus_status || '').toLowerCase().includes('erro') ||
                                                   String(n.focus_status || '').toLowerCase().includes('rejeitado');
                                    return n.status === "Emitida" && !isError;
                                });

                                if (notasParaExportar.length === 0) {
                                    toast.error("Nenhuma nota emitida encontrada para exportar.")
                                    return
                                }

                                const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
                                    import('jspdf'),
                                    import('jspdf-autotable'),
                                ])
                                const doc: JsPDFType = new jsPDF()
                                
                                // Título do relatório
                                doc.setFontSize(16)
                                doc.text("Relatório de Notas Fiscais Emitidas", 14, 20)
                                
                                // Subtítulo (filtros se houver)
                                doc.setFontSize(10)
                                let subtitle = "Período: "
                                if (filterDataInicioList && filterDataFimList) {
                                    subtitle += `${filterDataInicioList} a ${filterDataFimList}`
                                } else if (filterDataInicioList) {
                                    subtitle += `A partir de ${filterDataInicioList}`
                                } else if (filterDataFimList) {
                                    subtitle += `Até ${filterDataFimList}`
                                } else {
                                    subtitle += "Todo o período"
                                }
                                doc.text(subtitle, 14, 28)

                                // Preparando os dados para a tabela
                                const tableColumn = ["Data", "Nota", "Série", "Cliente", "Valor", "Status"]
                                const tableRows: any[] = []
                                let valorSomatorio = 0

                                notasParaExportar.forEach(nota => {
                                    const dataEmissao = new Date(nota.created_at).toLocaleDateString()
                                    const numNota = nota.numero_nota || "---"
                                    const serie = nota.serie || "0"
                                    const cliente = nota.clientes?.nome || "Consumidor"
                                    const val = Number(nota.valor_total || 0)
                                    valorSomatorio += val
                                    const valorStr = `R$ ${val.toFixed(2)}`
                                    const status = nota.status || ""
                                    
                                    tableRows.push([
                                        dataEmissao,
                                        numNota,
                                        serie,
                                        cliente,
                                        valorStr,
                                        status
                                    ])
                                })

                                // Add a total row
                                tableRows.push([
                                    "", "", "", "TOTAL:", `R$ ${valorSomatorio.toFixed(2)}`, ""
                                ])

                                autoTable(doc, {
                                    head: [tableColumn],
                                    body: tableRows,
                                    startY: 35,
                                    styles: { fontSize: 8 },
                                    headStyles: { fillColor: [16, 185, 129] }, // emerald-500
                                    didParseCell: function(data) {
                                        // Highlight the total row
                                        if (data.row.index === tableRows.length - 1) {
                                            data.cell.styles.fontStyle = 'bold';
                                            data.cell.styles.fillColor = [240, 253, 244]; // emerald-50
                                        }
                                    }
                                })

                                doc.save("relatorio_notas_fiscais.pdf")
                            } catch (e) {
                                toast.error("Falha ao exportar relatório em PDF.")
                            }
                        }}
                    >
                        <Download className="w-4 h-4 mr-2" /> Exportar PDF
                    </Button>
                </div>
            </div>

            <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        Histórico de Emissões
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-sm font-medium">Carregando registros fiscais...</p>
                        </div>
                    ) : notas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground border-2 border-dashed rounded-xl">
                            <AlertCircle className="w-12 h-12 opacity-20" />
                            <div className="text-center">
                                <p className="text-lg font-bold">Nenhuma nota emitida</p>
                                <p className="text-sm">As notas fiscais geradas aparecerão aqui.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-primary/10">
                                    <TableHead>Data</TableHead>
                                    <TableHead>Nota / Série</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Valor</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedNotas.map((nota) => (
                                    <TableRow key={nota.id} className="border-primary/5 hover:bg-primary/5 transition-colors">
                                        <TableCell className="text-xs">
                                            {new Date(nota.focus_payload?.data_emissao ? nota.focus_payload.data_emissao + "T12:00:00" : nota.created_at).toLocaleDateString()}
                                            <span className="block text-[10px] opacity-50">{new Date(nota.created_at).toLocaleTimeString()}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-bold">{nota.numero_nota || "---"}</span>
                                            <span className="text-[10px] block opacity-60">Série: {nota.serie || "0"}</span>
                                        </TableCell>
                                        <TableCell className="font-medium text-sm">
                                            {nota.clientes?.nome || "Consumidor"}
                                            {notaItemNames(nota).length > 0 && (
                                                <span className="block text-[10px] text-muted-foreground mt-0.5">
                                                    Itens: {notaItemNames(nota).slice(0, 2).join(", ")}
                                                    {notaItemNames(nota).length > 2 ? "…" : ""}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono font-bold text-foreground">
                                            R$ {nota.valor_total?.toFixed(2)}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Badge className={getStatusColor(nota.status, nota.focus_status)} variant="outline">
                                                        {nota.status}{nota.focus_status ? ` · ${nota.focus_status}` : ''}
                                                    </Badge>
                                                    {(nota.status === 'Erro' || (nota.focus_status && nota.focus_status.toLowerCase().includes('erro'))) && (
                                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                                                    )}
                                                </div>
                                                {nota.mensagem_status && (nota.status !== 'Emitida' && nota.status !== 'Cancelada') && (
                                                    <p className="text-xs text-rose-700 font-medium leading-snug max-w-[240px] bg-rose-50 px-2 py-1 rounded border border-rose-200">
                                                        {nota.mensagem_status}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" title="Ações">
                                                            <MoreVertical className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setSelectedNotaForDetalhes(nota)
                                                                setIsNotaDetalhesOpen(true)
                                                            }}
                                                            className="gap-2"
                                                        >
                                                            <Eye className="w-4 h-4" /> Ver detalhes
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => openInutilizacaoFromNota(nota)}
                                                            title="Inutilização de numeração é irreversível"
                                                            className="gap-2 text-rose-600 focus:text-rose-700"
                                                        >
                                                            <Ban className="w-4 h-4" /> Inutilizar numeração
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={async () => {
                                                                const token = getAuthToken()
                                                                const url = `${getApiBaseUrl()}/api/fiscal/nfe/${nota.id}/download/pdf?token=${token}`
                                                                window.open(url, "_blank")
                                                            }}
                                                            disabled={(!nota.focus_ref && !nota.url_pdf) || nota.status === "Erro"}
                                                            className="gap-2"
                                                        >
                                                            <Printer className="w-4 h-4" /> Imprimir PDF (DANFE)
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={async () => {
                                                                const token = getAuthToken()
                                                                const url = `${getApiBaseUrl()}/api/fiscal/nfe/${nota.id}/download/cce?token=${token}`
                                                                window.open(url, "_blank")
                                                            }}
                                                            disabled={!nota.focus_ref || nota.status !== "Emitida"}
                                                            className="gap-2"
                                                        >
                                                            <Printer className="w-4 h-4" /> Imprimir Carta Correção (CC-e)
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={async () => {
                                                                const token = getAuthToken()
                                                                const url = `${getApiBaseUrl()}/api/fiscal/nfe/${nota.id}/download/xml?token=${token}`
                                                                window.open(url, "_blank")
                                                            }}
                                                            disabled={(!nota.focus_ref && !nota.url_xml && !nota.focus_payload?.raw_xml) || nota.status === "Erro"}
                                                            className="gap-2"
                                                        >
                                                            <FileCode className="w-4 h-4" /> Baixar XML
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleAtualizarStatus(nota.id)}
                                                            disabled={!nota.focus_ref}
                                                            className="gap-2"
                                                        >
                                                            <RefreshCw className="w-4 h-4" /> Atualizar status
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setSelectedNotaForCorrecao(nota)
                                                                setIsCorrecaoModalOpen(true)
                                                            }}
                                                            disabled={nota.status !== "Emitida"}
                                                            className="gap-2"
                                                        >
                                                            <FileEdit className="w-4 h-4" /> Carta de correção (CC-e)
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setSelectedNotaForCancelamento(nota)
                                                                setIsCancelamentoModalOpen(true)
                                                            }}
                                                            disabled={nota.status === "Cancelada" || !nota.focus_ref || nota.status === "Processando"}
                                                            className="gap-2 text-rose-600 focus:text-rose-700"
                                                        >
                                                            <Ban className="w-4 h-4" /> Cancelar NF-e
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border/50 mt-6 animate-in fade-in duration-300">
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Página <span className="text-foreground">{currentPage}</span> de <span className="text-foreground">{totalPages}</span> · Mostrando <span className="text-foreground">{Math.min(notasFiltradas.length, (currentPage - 1) * itemsPerPage + 1)}</span> a <span className="text-foreground">{Math.min(notasFiltradas.length, currentPage * itemsPerPage)}</span> de <span className="text-foreground">{notasFiltradas.length}</span> registros
                                </p>
                                <div className="flex items-center gap-1.5 bg-muted/20 p-1 rounded-xl border border-border/40">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/80 shadow-none"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                        .map((page, idx, arr) => {
                                            const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                                            return (
                                                <div key={page} className="flex items-center gap-1">
                                                    {showEllipsis && <span className="text-muted-foreground text-[10px] font-bold px-1 select-none">...</span>}
                                                    <Button
                                                        variant={currentPage === page ? "default" : "ghost"}
                                                        size="sm"
                                                        onClick={() => setCurrentPage(page)}
                                                        className={cn(
                                                            "h-8 min-w-[32px] px-2.5 rounded-lg text-xs font-black transition-all",
                                                            currentPage === page 
                                                                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-105" 
                                                                : "text-muted-foreground hover:text-foreground hover:bg-background/80"
                                                        )}
                                                    >
                                                        {page}
                                                    </Button>
                                                </div>
                                            );
                                        })}

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/80 shadow-none"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
                </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <CardTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <Ban className="w-5 h-5 text-muted-foreground" />
                        Inutilizações (NF-e)
                    </CardTitle>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchInutilizacoes({ refresh: true })}
                        disabled={loadingInutilizacoes}
                    >
                        {loadingInutilizacoes ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Atualizar
                    </Button>
                </CardHeader>
                <CardContent>
                    {loadingInutilizacoes ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando inutilizações...
                        </div>
                    ) : inutilizacoes.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-6">
                            Nenhuma inutilização registrada.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-primary/10">
                                    <TableHead>Data</TableHead>
                                    <TableHead>Série/Ano</TableHead>
                                    <TableHead>Faixa</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Protocolo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {inutilizacoes.map((it: any) => (
                                    <TableRow key={it.id} className="border-primary/5 hover:bg-primary/5 transition-colors">
                                        <TableCell className="text-xs">
                                            {new Date(it.created_at).toLocaleDateString()}
                                            <span className="block text-[10px] opacity-50">{new Date(it.created_at).toLocaleTimeString()}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-bold">Série {it.serie}</span>
                                            <span className="text-[10px] block opacity-60">Ano: {it.ano}</span>
                                        </TableCell>
                                        <TableCell className="font-mono font-bold">
                                            {String(it.numero_inicial).padStart(3, "0")}–{String(it.numero_final).padStart(3, "0")}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    it.status === 'Autorizada'
                                                        ? 'border-emerald-500/30 text-emerald-700'
                                                        : it.status === 'Erro'
                                                            ? 'border-rose-500/30 text-rose-700'
                                                            : ''
                                                }
                                            >
                                                {it.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right text-xs font-mono opacity-80">
                                            {it.protocolo || '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            </> /* fim activeMainTab === 'nfe' */}

            {/* ===== ABA MDF-e ===== */}
            {activeMainTab === 'mdfe' && (
                <div className="space-y-4">
                    {/* Filtros MDF-e */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por placa, número ou chave..." className="pl-10"
                                value={mdfeSearchTerm} onChange={e => setMdfeSearchTerm(e.target.value)} />
                        </div>
                        <div className="flex gap-2 items-center">
                            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-lg border border-border/50">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <Input type="date" className="h-8 border-0 bg-transparent focus-visible:ring-0 w-32 p-0 text-xs"
                                    value={mdfeFilterInicio} onChange={e => setMdfeFilterInicio(e.target.value)} />
                                <span className="text-muted-foreground text-[10px] font-bold">ATÉ</span>
                                <Input type="date" className="h-8 border-0 bg-transparent focus-visible:ring-0 w-32 p-0 text-xs"
                                    value={mdfeFilterFim} onChange={e => setMdfeFilterFim(e.target.value)} />
                            </div>
                            <Button variant="secondary" size="sm" className="font-bold h-10 px-4" onClick={fetchMdfes}>
                                <Filter className="w-4 h-4 mr-2" /> Filtrar
                            </Button>
                            <Button variant="outline" size="sm" className="h-10" onClick={fetchMdfes}>
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Tabela MDF-e */}
                    <Card className="border-border bg-card shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                                <Truck className="w-5 h-5 text-muted-foreground" />
                                Manifestos Eletrônicos (MDF-e)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingMdfes ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                                    <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                                    <p className="text-sm font-medium">Carregando MDF-e...</p>
                                </div>
                            ) : mdfes.filter(m => {
                                if (!mdfeSearchTerm.trim()) return true
                                const s = mdfeSearchTerm.toLowerCase()
                                return String(m.placa_veiculo || '').toLowerCase().includes(s)
                                    || String(m.numero_mdfe || '').includes(s)
                                    || String(m.chave_acesso || '').includes(s)
                            }).length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground border-2 border-dashed rounded-xl">
                                    <Truck className="w-12 h-12 opacity-20" />
                                    <div className="text-center">
                                        <p className="text-lg font-bold">Nenhum MDF-e emitido</p>
                                        <p className="text-sm">Os manifestos eletrônicos aparecerão aqui.</p>
                                    </div>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent border-blue-500/10">
                                            <TableHead>Data</TableHead>
                                            <TableHead>Nº / Série</TableHead>
                                            <TableHead>Rota</TableHead>
                                            <TableHead>Veículo</TableHead>
                                            <TableHead>NF-e Vinculadas</TableHead>
                                            <TableHead>Valor Carga</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {mdfes
                                            .filter(m => {
                                                if (!mdfeSearchTerm.trim()) return true
                                                const s = mdfeSearchTerm.toLowerCase()
                                                return String(m.placa_veiculo || '').toLowerCase().includes(s)
                                                    || String(m.numero_mdfe || '').includes(s)
                                                    || String(m.chave_acesso || '').includes(s)
                                            })
                                            .map(mdfe => (
                                            <TableRow key={mdfe.id} className="border-blue-500/5 hover:bg-blue-500/5 transition-colors">
                                                <TableCell className="text-xs">
                                                    {new Date(mdfe.created_at).toLocaleDateString()}
                                                    <span className="block text-[10px] opacity-50">{new Date(mdfe.created_at).toLocaleTimeString()}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-bold">{mdfe.numero_mdfe || "---"}</span>
                                                    <span className="text-[10px] block opacity-60">Série {mdfe.serie}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-bold text-sm">{mdfe.uf_inicio} → {mdfe.uf_fim}</span>
                                                    {mdfe.municipio_carregamento_nome && (
                                                        <span className="text-[10px] block text-muted-foreground">{mdfe.municipio_carregamento_nome}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-mono font-bold">{mdfe.placa_veiculo || '—'}</span>
                                                    {mdfe.uf_veiculo && <span className="text-[10px] block opacity-60">{mdfe.uf_veiculo}</span>}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm">{Array.isArray(mdfe.chaves_nfe) ? mdfe.chaves_nfe.length : 0} nota(s)</span>
                                                    {Array.isArray(mdfe.condutores) && mdfe.condutores[0]?.nome && (
                                                        <span className="text-[10px] block text-muted-foreground">{mdfe.condutores[0].nome}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-mono font-bold">
                                                    {mdfe.valor_total_carga != null ? `R$ ${Number(mdfe.valor_total_carga).toFixed(2)}` : '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={getMdfeStatusColor(mdfe.status)} variant="outline">
                                                        {mdfe.status}
                                                    </Badge>
                                                    {mdfe.mensagem_status && mdfe.status === 'Pendente' && (
                                                        <p className="text-[10px] text-amber-700 mt-1 max-w-[160px] leading-snug">{mdfe.mensagem_status}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleRefreshMdfe(mdfe.id)} className="gap-2">
                                                                <RefreshCw className="w-4 h-4" /> Atualizar Status
                                                            </DropdownMenuItem>
                                                            {mdfe.status === 'Emitido' && (
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSelectedMdfeForEncerramento(mdfe)
                                                                        setMdfeEncUf(mdfe.uf_fim || '')
                                                                        setIsEncerramentoModalOpen(true)
                                                                    }}
                                                                    className="gap-2 text-blue-600"
                                                                >
                                                                    <CheckCircle2 className="w-4 h-4" /> Encerrar MDF-e
                                                                </DropdownMenuItem>
                                                            )}
                                                            {(mdfe.status === 'Emitido' || mdfe.status === 'Pendente') && (
                                                                <>
                                                                    <DropdownMenuItem
                                                                        onClick={() => {
                                                                            const token = getAuthToken()
                                                                            window.open(`${getApiBaseUrl()}/api/fiscal/mdfe/${mdfe.id}/download/pdf?token=${token}`, '_blank')
                                                                        }}
                                                                        className="gap-2"
                                                                    >
                                                                        <Printer className="w-4 h-4" /> DAMDFE (PDF)
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        onClick={() => {
                                                                            const token = getAuthToken()
                                                                            window.open(`${getApiBaseUrl()}/api/fiscal/mdfe/${mdfe.id}/download/xml?token=${token}`, '_blank')
                                                                        }}
                                                                        className="gap-2"
                                                                    >
                                                                        <FileCode className="w-4 h-4" /> XML
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                            {mdfe.status !== 'Cancelado' && mdfe.status !== 'Encerrado' && (
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSelectedMdfeForCancel(mdfe)
                                                                        setIsCancelMdfeModalOpen(true)
                                                                    }}
                                                                    className="gap-2 text-rose-600"
                                                                >
                                                                    <Ban className="w-4 h-4" /> Cancelar MDF-e
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ===== MODAL DE EMISSÃO STEPPER FINAL ===== */}
            <Modal
                isOpen={isEmitModalOpen} 
                onClose={handleTryCloseEmitModal} 
                title={`Emissão de NF-e - Passo ${emissaoStep} de 5`}
                className="max-w-5xl"
            >
                <div className="space-y-4 py-2">
                    {/* Barra de Progresso (Stepper) */}
                    <div className="flex items-center justify-between px-2 mb-4">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <div key={s} className="flex items-center text-center flex-1 last:flex-none">
                                <div className="flex flex-col items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors shadow-sm ${
                                        emissaoStep === s ? 'bg-primary text-primary-foreground border-4 border-primary/20' : 
                                        emissaoStep > s ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                                    }`}>
                                        {emissaoStep > s ? '✓' : s}
                                    </div>
                                    <span className={`text-[9px] font-bold uppercase tracking-tighter ${emissaoStep === s ? 'text-primary' : 'text-muted-foreground'}`}>
                                        {s === 1 ? 'Origem' : s === 2 ? 'Destinatário' : s === 3 ? 'Transporte' : s === 4 ? 'Fiscal' : 'Revisão'}
                                    </span>
                                </div>
                                {s < 5 && (
                                    <div className={`flex-1 h-0.5 mx-4 -mt-6 ${emissaoStep > s ? 'bg-green-500' : 'bg-muted'}`} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* PASSO 1: Seleção de Origem */}
                    {emissaoStep === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                             <div className="flex flex-wrap bg-muted/50 p-1.5 rounded-xl gap-1.5 border border-border/50">
                                <Button 
                                    variant="ghost" 
                                    className={cn("flex-1 h-10 font-bold text-xs transition-all", emissaoTipo === 'vincular' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:bg-muted")}
                                    onClick={() => setEmissaoTipo('vincular')}
                                >
                                    <Package className="w-4 h-4 mr-2" /> Vincular Pedido
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className={cn("flex-1 h-10 font-bold text-xs transition-all", emissaoTipo === 'avulsa' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:bg-muted")}
                                    onClick={() => setEmissaoTipo('avulsa')}
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Nota Avulsa
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className={cn("flex-1 h-10 font-bold text-xs transition-all", emissaoTipo === 'devolucao' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:bg-muted")}
                                    onClick={() => setEmissaoTipo('devolucao')}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2 text-orange-600" /> Devolver de Cliente (Entrada)
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className={cn("flex-1 h-10 font-bold text-xs transition-all", emissaoTipo === 'devolucao_compra' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:bg-muted")}
                                    onClick={() => setEmissaoTipo('devolucao_compra')}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2 text-blue-600" /> Devolver a Fornecedor (Saída)
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className={cn("flex-1 h-10 font-bold text-xs transition-all", emissaoTipo === 'entrada_compra' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:bg-muted")}
                                    onClick={() => setEmissaoTipo('entrada_compra')}
                                >
                                    <Plus className="w-4 h-4 mr-2 text-green-600" /> Entrada (Compra)
                                </Button>
                             </div>

                             {emissaoTipo === 'vincular' ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="md:col-span-1 space-y-4 p-5 border border-border rounded-2xl bg-muted/10">
                                        <p className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5 border-b border-primary/10 pb-2">
                                            <Filter className="w-3 h-3" /> Filtros de Pesquisa
                                        </p>
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-[11px] font-bold">Palavra-chave</Label>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                                    <Input 
                                                        value={vendaSearchTerm} 
                                                        onChange={(e) => setVendaSearchTerm(e.target.value)} 
                                                        placeholder="Nº, Cliente ou Peça..." 
                                                        className="pl-9 h-9 text-xs" 
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[11px] font-bold">Data Inicial</Label>
                                                <Input type="date" value={filterDataInicio} onChange={e => setFilterDataInicio(e.target.value)} className="h-9 text-xs" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[11px] font-bold">Data Final</Label>
                                                <Input type="date" value={filterDataFim} onChange={e => setFilterDataFim(e.target.value)} className="h-9 text-xs" />
                                            </div>
                                            {temFiltroAtivo && (
                                                <Button variant="ghost" className="w-full text-[10px] h-7 text-primary hover:text-primary/80" onClick={limparFiltrosModal}>
                                                    Limpar Filtros
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-3">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground border-b border-border pb-2 flex justify-between">
                                            <span>Resultados Encontrados</span>
                                            <span className="text-primary font-bold">{vendasOptions.length} pedidos</span>
                                        </p>
                                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                            {loadingVendas ? (
                                                 <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                                                     <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                                     <p className="text-xs font-medium">Buscando pedidos recentes...</p>
                                                 </div>
                                             ) : vendasOptions.length === 0 ? (
                                                <div className="p-10 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                                                    <p className="text-sm">Nenhum pedido encontrado com esses filtros.</p>
                                                </div>
                                            ) : (
                                                vendasOptions.map((v: any) => (
                                                    <button 
                                                        key={v.id} 
                                                        onClick={() => setSelectedVendaId(v.id)}
                                                        className={cn(
                                                            "w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center group shadow-sm hover:shadow-md",
                                                            selectedVendaId === v.id ? "bg-primary/5 border-primary ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/50"
                                                        )}
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-black text-primary">#{String(v.numero_pedido).padStart(6, '0')}</span>
                                                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-mono">{fmtData(v.data_venda || v.created_at)}</span>
                                                            </div>
                                                            <p className="text-sm font-bold text-foreground truncate max-w-[250px]">{v.clientes?.nome || 'Cliente não identificado'}</p>
                                                            <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                                <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {v.vendas_itens?.length || 0} itens</span>
                                                                <span>•</span>
                                                                <span>Total: R$ {Number(v.total).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className={cn(
                                                            "w-6 h-6 rounded-full border flex items-center justify-center transition-colors",
                                                            selectedVendaId === v.id ? "bg-primary border-primary text-primary-foreground" : "border-muted group-hover:border-primary/50"
                                                        )}>
                                                            {selectedVendaId === v.id ? <CheckCircle2 className="w-4 h-4" /> : null}
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                              ) : emissaoTipo === 'entrada_compra' ? (
                                 <div className="p-10 text-center border border-dashed rounded-2xl bg-muted/5 space-y-6">
                                     <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto ring-8 ring-green-500/5">
                                         <User className="w-10 h-10 text-green-600" />
                                     </div>
                                     <div className="max-w-md mx-auto space-y-4">
                                         <div>
                                             <h3 className="text-xl font-black uppercase tracking-tight">Entrada de Produtos (Compra)</h3>
                                             <p className="text-xs text-muted-foreground">
                                                 Selecione o Fornecedor que realizou a venda para a loja.
                                             </p>
                                         </div>
                                         
                                         <div className="space-y-3 text-left bg-background p-5 rounded-xl border shadow-sm">
                                             <div className="flex items-center gap-2">
                                                 <div className="relative group flex-1">
                                                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                     <Input 
                                                         placeholder="Digite o fornecedor ou CNPJ/CPF..."
                                                         className="pl-10 h-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20"
                                                         value={fornecedorSearch}
                                                         onChange={(e) => setFornecedorSearch(e.target.value)}
                                                     />
                                                 </div>
                                             </div>

                                             <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 border rounded-lg bg-muted/5 p-1 custom-scrollbar">
                                                 {loadingFornecedores ? (
                                                     <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                                                 ) : fornecedoresFiltrados.length === 0 ? (
                                                     <p className="p-4 text-center text-xs text-muted-foreground italic">Nenhum fornecedor encontrado...</p>
                                                 ) : (
                                                     fornecedoresFiltrados.map((f: any) => (
                                                         <button 
                                                             type="button"
                                                             key={f.id}
                                                             onClick={() => setSelectedFornecedorId(f.id)}
                                                             className={cn(
                                                                 "w-full text-left p-3 rounded-lg text-sm transition-all flex items-center justify-between group/item",
                                                                 selectedFornecedorId === f.id 
                                                                     ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20" 
                                                                     : "hover:bg-primary/5 text-foreground"
                                                             )}
                                                         >
                                                             <div className="min-w-0">
                                                                 <p className="font-bold truncate">{f.razao_social || f.nome}</p>
                                                                 <p className={cn("text-[10px] opacity-70", selectedFornecedorId === f.id ? "text-primary-foreground" : "text-muted-foreground")}>
                                                                     {f.documento || f.cnpj || 'Sem Documento'} • {f.cidade || '---'}/{f.estado || '--'}
                                                                 </p>
                                                             </div>
                                                             <div className={cn(
                                                                 "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-transform group-hover/item:scale-110",
                                                                 selectedFornecedorId === f.id ? "bg-white text-primary border-white" : "border-muted text-transparent"
                                                             )}>
                                                                 <CheckCircle2 className="w-3 h-3" />
                                                             </div>
                                                         </button>
                                                     ))
                                                 )}
                                             </div>
                                         </div>

                                         <Button 
                                             onClick={() => setEmissaoStep(2)} 
                                             className="h-11 px-10 font-black uppercase tracking-widest bg-primary shadow-lg shadow-primary/20 group"
                                             disabled={!selectedFornecedorId}
                                         >
                                             Próximo Passo <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                         </Button>
                                     </div>
                                 </div>
                              ) : emissaoTipo === 'avulsa' ? (
                                 <div className="p-10 text-center border border-dashed rounded-2xl bg-muted/5 space-y-6">
                                     <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto ring-8 ring-primary/5">
                                         <User className="w-10 h-10 text-primary" />
                                     </div>
                                     <div className="max-w-md mx-auto space-y-4">
                                         <div>
                                             <h3 className="text-xl font-black uppercase tracking-tight">Nova Nota Avulsa</h3>
                                             <p className="text-xs text-muted-foreground">
                                                 Identifique o cliente para iniciar o preenchimento manual dos dados fiscais.
                                             </p>
                                         </div>
                                         
                                         <div className="space-y-3 text-left bg-background p-5 rounded-xl border shadow-sm">
                                             <div className="flex items-center gap-2">
                                                 <div className="relative group flex-1">
                                                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                     <Input 
                                                         placeholder="Digite o nome ou documento do cliente..."
                                                         className="pl-10 h-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20"
                                                         value={clienteSearchTerm}
                                                         onChange={(e) => setClienteSearchTerm(e.target.value)}
                                                     />
                                                 </div>
                                                 <Button 
                                                     type="button"
                                                     variant="outline" 
                                                     className="h-11 px-3 border-primary/20 text-primary hover:bg-primary/5 font-bold"
                                                     onClick={() => setIsCreatingNewClient(true)}
                                                     title="Cadastrar Novo Cliente"
                                                 >
                                                     <Plus className="w-5 h-5 mr-1" /> Novo
                                                 </Button>
                                             </div>

                                             <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 border rounded-lg bg-muted/5 p-1 custom-scrollbar">
                                                 {loadingClientes ? (
                                                     <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                                                 ) : clientesFiltrados.length === 0 ? (
                                                     <p className="p-4 text-center text-xs text-muted-foreground italic">Nenhum cliente encontrado...</p>
                                                 ) : (
                                                     clientesFiltrados.map(c => (
                                                         <button 
                                                             type="button"
                                                             key={c.id}
                                                             onClick={() => setSelectedClienteId(c.id)}
                                                             className={cn(
                                                                 "w-full text-left p-3 rounded-lg text-sm transition-all flex items-center justify-between group/item",
                                                                 selectedClienteId === c.id 
                                                                     ? "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/20" 
                                                                     : "hover:bg-primary/5 text-foreground"
                                                             )}
                                                         >
                                                             <div className="min-w-0">
                                                                 <p className="font-bold truncate">{c.nome}</p>
                                                                 <p className={cn("text-[10px] opacity-70", selectedClienteId === c.id ? "text-primary-foreground" : "text-muted-foreground")}>
                                                                     {c.documento || 'Sem Documento'} • {c.cidade || '---'}/{c.uf || '--'}
                                                                 </p>
                                                             </div>
                                                             <div className={cn(
                                                                 "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-transform group-hover/item:scale-110",
                                                                 selectedClienteId === c.id ? "bg-white text-primary border-white" : "border-muted text-transparent"
                                                             )}>
                                                                 <CheckCircle2 className="w-3 h-3" />
                                                             </div>
                                                         </button>
                                                     ))
                                                 )}
                                             </div>
                                         </div>

                                         <Button 
                                             onClick={() => setEmissaoStep(2)} 
                                             className="h-11 px-10 font-black uppercase tracking-widest bg-primary shadow-lg shadow-primary/20 group"
                                             disabled={!selectedClienteId}
                                         >
                                             Próximo: Dados do Cliente <X className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-all rotate-45" />
                                         </Button>
                                     </div>
                                 </div>
                              ) : emissaoTipo === 'devolucao' ? (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                      <div className="md:col-span-1 space-y-4 p-5 border border-border rounded-2xl bg-muted/10">
                                          <p className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5 border-b border-primary/10 pb-2">
                                              <Filter className="w-3 h-3" /> Info Fiscais de Devolução
                                          </p>
                                          <div className="space-y-3 text-left">
                                              <div className="space-y-1.5">
                                                  <Label className="text-[11px] font-bold">Chave de Acesso Original (44 dígitos)</Label>
                                                  <Input 
                                                      value={chaveReferenciada} 
                                                      onChange={(e) => setChaveReferenciada(e.target.value.replace(/\D/g, '').slice(0, 44))} 
                                                      placeholder="Cole aqui a chave referenciada..." 
                                                      className="h-9 text-xs font-mono" 
                                                  />
                                                  <span className="text-[9px] text-muted-foreground block">
                                                      Obrigatório para validar a devolução na SEFAZ. ({chaveReferenciada.length}/44)
                                                  </span>
                                              </div>
                                              <div className="space-y-1.5">
                                                  <Label className="text-[11px] font-bold">Tipo de Documento</Label>
                                                  <select 
                                                      value={tipoDocumento} 
                                                      onChange={e => setTipoDocumento(Number(e.target.value))} 
                                                      className="w-full text-xs h-9 bg-background border border-input rounded-md px-3"
                                                  >
                                                      <option value={0}>0 - Entrada (Padrão para Devolução de Cliente)</option>
                                                      <option value={1}>1 - Saída</option>
                                                  </select>
                                              </div>
                                              <div className="space-y-1.5">
                                                  <Label className="text-[11px] font-bold">CFOP de Devolução</Label>
                                                  <FiscalSelect
                                                      value={cfopPadrao}
                                                      onChange={setCfopPadrao}
                                                      options={CFOP_ENTRADA}
                                                      className="text-xs border-primary/20 h-9"
                                                  />
                                              </div>
                                              
                                              <div className="pt-4 border-t border-border mt-4">
                                                  <Button 
                                                      onClick={() => setEmissaoStep(2)} 
                                                      className="w-full h-10 font-bold text-xs uppercase bg-primary hover:bg-primary/90 text-primary-foreground"
                                                      disabled={!selectedDevolucaoId || chaveReferenciada.length !== 44}
                                                  >
                                                      Próximo: Destinatário
                                                  </Button>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="md:col-span-2 space-y-3">
                                          <p className="text-[10px] font-black uppercase text-muted-foreground border-b border-border pb-2 flex justify-between">
                                              <span>Selecionar Devolução Aprovada</span>
                                              <span className="text-primary font-bold">{devolucoesAprovadas.length} devoluções</span>
                                          </p>
                                          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                              {loadingDevolucoesAprovadas ? (
                                                   <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                                                       <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                                       <p className="text-xs font-medium">Buscando devoluções...</p>
                                                   </div>
                                               ) : devolucoesAprovadas.length === 0 ? (
                                                  <div className="p-10 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                                                      <p className="text-sm">Nenhuma devolução aprovada encontrada.</p>
                                                  </div>
                                              ) : (
                                                  devolucoesAprovadas.map((d: any) => (
                                                      <button 
                                                          type="button"
                                                          key={d.id} 
                                                          onClick={() => setSelectedDevolucaoId(d.id)}
                                                          className={cn(
                                                              "w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center group shadow-sm hover:shadow-md",
                                                              selectedDevolucaoId === d.id ? "bg-primary/5 border-primary ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/50"
                                                          )}
                                                      >
                                                          <div className="space-y-1">
                                                              <div className="flex items-center gap-2">
                                                                  <span className="text-xs font-black text-primary font-mono">Pedido {d.vendas?.numero_pedido ? `#${String(d.vendas.numero_pedido).padStart(6, '0')}` : '—'}</span>
                                                                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-mono">{fmtData(d.created_at)}</span>
                                                              </div>
                                                              <p className="text-sm font-bold text-foreground truncate max-w-[250px]">{d.clientes?.nome || 'Cliente não identificado'}</p>
                                                              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                                  <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 text-orange-600 animate-none" /> Reembolso: R$ {Number(d.valor_reembolso || d.total_devolvido || 0).toFixed(2)}</span>
                                                                  <span>•</span>
                                                                  <span>Status: {d.status}</span>
                                                              </div>
                                                          </div>
                                                          <div className={cn(
                                                              "w-6 h-6 rounded-full border flex items-center justify-center transition-colors",
                                                              selectedDevolucaoId === d.id ? "bg-primary border-primary text-primary-foreground" : "border-muted group-hover:border-primary/50"
                                                          )}>
                                                              {selectedDevolucaoId === d.id ? <CheckCircle2 className="w-4 h-4" /> : null}
                                                          </div>
                                                      </button>
                                                  ))
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                      <div className="md:col-span-1 space-y-4 p-5 border border-border rounded-2xl bg-muted/10">
                                          <p className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5 border-b border-primary/10 pb-2">
                                              <Filter className="w-3 h-3" /> Info Fiscais de Devolução
                                          </p>
                                          <div className="space-y-3 text-left">
                                              <div className="space-y-1.5">
                                                  <Label className="text-[11px] font-bold">Chave de Acesso Original (44 dígitos)</Label>
                                                  <Input 
                                                      value={chaveReferenciada} 
                                                      onChange={(e) => setChaveReferenciada(e.target.value.replace(/\D/g, '').slice(0, 44))} 
                                                      placeholder="Cole a chave da nota do fornecedor..." 
                                                      className="h-9 text-xs font-mono" 
                                                  />
                                                  <span className="text-[9px] text-muted-foreground block">
                                                      Obrigatório para referenciar a nota original. ({chaveReferenciada.length}/44)
                                                  </span>
                                              </div>
                                              <div className="space-y-1.5">
                                                  <Label className="text-[11px] font-bold">Tipo de Documento</Label>
                                                  <select 
                                                      value={tipoDocumento} 
                                                      onChange={e => setTipoDocumento(Number(e.target.value))} 
                                                      className="w-full text-xs h-9 bg-background border border-input rounded-md px-3"
                                                  >
                                                      <option value={1}>1 - Saída (Padrão para Devolução de Compra)</option>
                                                      <option value={0}>0 - Entrada</option>
                                                  </select>
                                              </div>
                                              
                                              <div className="pt-4 border-t border-border mt-4">
                                                  <Button 
                                                      onClick={() => setEmissaoStep(2)} 
                                                      className="w-full h-10 font-bold text-xs uppercase bg-primary hover:bg-primary/90 text-primary-foreground"
                                                      disabled={!selectedFornecedorId || chaveReferenciada.length !== 44}
                                                  >
                                                      Próximo: Destinatário
                                                  </Button>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="md:col-span-2 space-y-3">
                                          <div className="flex bg-muted/20 p-1 rounded-lg border border-border mb-3">
                                              <button 
                                                  type="button"
                                                  onClick={() => {
                                                      setDevolucaoCompraMode('nota')
                                                      setManualItens([])
                                                      setSelectedNotaEntradaId("")
                                                      setSelectedFornecedorId("")
                                                      setChaveReferenciada("")
                                                  }}
                                                  className={cn("flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", devolucaoCompraMode === 'nota' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                                              >
                                                  Devolver a partir de Nota de Entrada (XML)
                                              </button>
                                              <button 
                                                  type="button"
                                                  onClick={() => {
                                                      setDevolucaoCompraMode('avulso')
                                                      setManualItens([])
                                                      setSelectedNotaEntradaId("")
                                                      setSelectedFornecedorId("")
                                                      setChaveReferenciada("")
                                                      addManualItem()
                                                  }}
                                                  className={cn("flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", devolucaoCompraMode === 'avulso' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                                              >
                                                  Devolução Avulsa (Digitar Fornecedor/Itens)
                                              </button>
                                          </div>

                                          {devolucaoCompraMode === 'nota' ? (
                                              <div className="space-y-4">
                                                  <div className="space-y-2">
                                                      <p className="text-[10px] font-black uppercase text-muted-foreground border-b border-border pb-2 flex justify-between">
                                                          <span>Selecionar Nota de Entrada</span>
                                                          <span className="text-primary font-bold">{notasEntrada.length} notas no histórico</span>
                                                      </p>
                                                      
                                                      {notasEntrada.length === 0 ? (
                                                          <div className="p-10 text-center border-2 border-dashed rounded-xl text-muted-foreground bg-card">
                                                              <p className="text-xs font-semibold">Nenhuma Nota de Entrada encontrada.</p>
                                                              <p className="text-[10px] mt-1">Importe notas XML na aba de Pedidos de Compras antes de devolvê-las aqui.</p>
                                                          </div>
                                                      ) : (
                                                          <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                                              {notasEntrada.map((n: any) => (
                                                                  <button 
                                                                      type="button"
                                                                      key={n.id} 
                                                                      onClick={() => handleSelectNotaEntrada(n)}
                                                                      className={cn(
                                                                          "w-full text-left p-3.5 rounded-xl border transition-all flex justify-between items-center group shadow-sm hover:shadow-md",
                                                                          selectedNotaEntradaId === n.id ? "bg-primary/5 border-primary ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/50"
                                                                      )}
                                                                  >
                                                                      <div className="space-y-1">
                                                                          <div className="flex items-center gap-2">
                                                                              <span className="text-xs font-black text-primary font-mono">Nota #{n.numero_nota}</span>
                                                                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-mono font-bold">Emissão: {fmtData(n.data_emissao)}</span>
                                                                          </div>
                                                                          <p className="text-xs font-bold text-foreground truncate max-w-[280px]">{n.fornecedor_nome}</p>
                                                                          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                                              <span className="font-mono text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded font-bold">R$ {Number(n.valor_total).toFixed(2)}</span>
                                                                              <span>•</span>
                                                                              <span>CNPJ: {n.fornecedor_cnpj || '—'}</span>
                                                                          </div>
                                                                      </div>
                                                                      <div className={cn(
                                                                          "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                                                                          selectedNotaEntradaId === n.id ? "bg-primary border-primary text-primary-foreground" : "border-muted group-hover:border-primary/50"
                                                                      )}>
                                                                          {selectedNotaEntradaId === n.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                                                                      </div>
                                                                  </button>
                                                              ))}
                                                          </div>
                                                      )}
                                                  </div>

                                                  {selectedNotaEntradaId && (
                                                      <div className="space-y-3 pt-3 border-t border-border animate-in fade-in zoom-in-95">
                                                          {selectedNotaEntradaId && !selectedFornecedorId && (
                                                              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-500/5 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs space-y-3 text-left animate-in fade-in zoom-in-95">
                                                                  <div className="flex items-center gap-2">
                                                                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
                                                                      <div>
                                                                          <p className="font-black uppercase tracking-wider text-[10px] text-amber-700 dark:text-amber-400">Fornecedor não Cadastrado</p>
                                                                          <p className="text-muted-foreground text-[10px] mt-0.5">Identificamos o fornecedor pelo XML, mas ele ainda não consta no banco de dados.</p>
                                                                      </div>
                                                                  </div>
                                                                  <p className="leading-relaxed font-medium text-foreground">
                                                                      O fornecedor <b>{(() => {
                                                                          const selectedNota = notasEntrada.find(n => n.id === selectedNotaEntradaId)
                                                                          return selectedNota ? selectedNota.fornecedor_nome : ''
                                                                      })()}</b> (CNPJ: {(() => {
                                                                          const selectedNota = notasEntrada.find(n => n.id === selectedNotaEntradaId)
                                                                          return selectedNota ? selectedNota.fornecedor_cnpj : ''
                                                                      })()}) não foi localizado no sistema. Cadastre-o para continuar.
                                                                  </p>
                                                                  <div className="flex gap-2 pt-1">
                                                                      <Button 
                                                                          type="button"
                                                                          size="sm"
                                                                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] h-8 px-4 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                                                                          onClick={async () => {
                                                                              const selectedNota = notasEntrada.find(n => n.id === selectedNotaEntradaId)
                                                                              if (!selectedNota) return
                                                                              try {
                                                                                  const payload = {
                                                                                      nome: selectedNota.fornecedor_nome,
                                                                                      razao_social: selectedNota.fornecedor_nome,
                                                                                      documento: selectedNota.fornecedor_cnpj,
                                                                                      observacoes: "Cadastrado automaticamente via XML de Nota de Entrada"
                                                                                  }
                                                                                  const created = await configuracoesApi.criarFornecedor(payload)
                                                                                  toast.success("Fornecedor cadastrado com sucesso!")
                                                                                  
                                                                                  // Recarrega os fornecedores
                                                                                  const data = await configuracoesApi.listarFornecedores()
                                                                                  setFornecedores(Array.isArray(data) ? data : [])
                                                                                  
                                                                                  // Seleciona o recém criado
                                                                                  setSelectedFornecedorId(created.id)
                                                                              } catch (err: any) {
                                                                                  toast.error("Erro ao cadastrar fornecedor: " + (err.message || err))
                                                                              }
                                                                          }}
                                                                      >
                                                                          <Plus className="w-3.5 h-3.5" /> Cadastrar Fornecedor Agora
                                                                      </Button>
                                                                  </div>
                                                              </div>
                                                          )}
                                                          <p className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5">
                                                              <Package className="w-3.5 h-3.5" /> Escolha os Itens e Quantidades a Devolver
                                                          </p>
                                                          
                                                          <div className="max-h-[300px] overflow-y-auto border border-border rounded-xl bg-muted/5 divide-y divide-border/60 custom-scrollbar">
                                                              {(() => {
                                                                  const selectedNota = notasEntrada.find(n => n.id === selectedNotaEntradaId)
                                                                  if (!selectedNota) return null
                                                                  
                                                                  return (selectedNota.itens || []).map((it: any) => {
                                                                      const currentQty = devolucaoQuantities[it._key] ?? it.quantidade
                                                                      
                                                                      return (
                                                                          <div key={it._key} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                                                                              <div className="min-w-0 flex-1">
                                                                                  <h5 className="text-xs font-bold text-foreground line-clamp-1">{it.nome}</h5>
                                                                                  <p className="text-[10px] text-muted-foreground font-mono">
                                                                                      Part Number: {it.part_number || '—'} · SKU: {it.sku || '—'}
                                                                                  </p>
                                                                                  <p className="text-[10px] text-primary font-bold mt-0.5">
                                                                                      Custo: R$ {Number(it.custo).toFixed(2)}
                                                                                  </p>
                                                                              </div>
                                                                              
                                                                              <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                                                                                  <div className="text-right text-[10px] text-muted-foreground">
                                                                                      <span>Original: <b>{it.quantidade} UN</b></span>
                                                                                  </div>
                                                                                  <div className="flex items-center gap-1.5">
                                                                                      <Label className="text-[10px] font-bold">Devolver:</Label>
                                                                                      <Input
                                                                                          type="number"
                                                                                          min={0}
                                                                                          max={it.quantidade}
                                                                                          value={currentQty}
                                                                                          onChange={(e) => handleDevolucaoQtyChange(it._key, parseInt(e.target.value) || 0, it.quantidade)}
                                                                                          className="w-20 h-8 text-center text-xs font-mono font-bold"
                                                                                      />
                                                                                      <span className="text-[10px] font-semibold text-muted-foreground">UN</span>
                                                                                  </div>
                                                                              </div>
                                                                          </div>
                                                                      )
                                                                  })
                                                              })()}
                                                          </div>
                                                      </div>
                                                  )}
                                              </div>
                                          ) : (
                                              <div className="space-y-3 animate-in fade-in">
                                                  <p className="text-[10px] font-black uppercase text-muted-foreground border-b border-border pb-2 flex justify-between">
                                                      <span>Selecionar Fornecedor</span>
                                                      <span className="text-primary font-bold">
                                                          {fornecedorSearch.trim() ? `${fornecedoresFiltrados.length} de ${fornecedores.length}` : `${fornecedores.length}`} fornecedores
                                                      </span>
                                                  </p>
                                                  <div className="relative group">
                                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors animate-none" />
                                                      <Input 
                                                          placeholder="Pesquisar por nome, CNPJ ou cidade/UF..."
                                                          className="pl-10 h-10 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 text-xs"
                                                          value={fornecedorSearch}
                                                          onChange={(e) => setFornecedorSearch(e.target.value)}
                                                      />
                                                  </div>
                                                  <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                                      {loadingFornecedores ? (
                                                           <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                                                               <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                                               <p className="text-xs font-medium">Buscando fornecedores...</p>
                                                           </div>
                                                       ) : fornecedoresFiltrados.length === 0 ? (
                                                          <div className="p-10 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                                                              <p className="text-sm">{fornecedores.length === 0 ? "Nenhum fornecedor cadastrado." : "Nenhum fornecedor encontrado para esta pesquisa."}</p>
                                                          </div>
                                                      ) : (
                                                          fornecedoresFiltrados.map((f: any) => (
                                                              <button 
                                                                  type="button"
                                                                  key={f.id} 
                                                                  onClick={() => setSelectedFornecedorId(f.id)}
                                                                  className={cn(
                                                                      "w-full text-left p-4 rounded-xl border transition-all flex justify-between items-center group shadow-sm hover:shadow-md",
                                                                      selectedFornecedorId === f.id ? "bg-primary/5 border-primary ring-1 ring-primary/20" : "bg-card border-border hover:border-primary/50"
                                                                  )}
                                                              >
                                                                  <div className="space-y-1">
                                                                      <p className="text-sm font-bold text-foreground truncate max-w-[250px]">{f.razao_social || f.nome}</p>
                                                                      <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                                          <span>CNPJ: {f.cnpj || f.documento || '—'}</span>
                                                                          <span>•</span>
                                                                          <span>Cidade/UF: {f.cidade || '—'}/{f.estado || '—'}</span>
                                                                      </div>
                                                                  </div>
                                                                  <div className={cn(
                                                                      "w-6 h-6 rounded-full border flex items-center justify-center transition-colors",
                                                                      selectedFornecedorId === f.id ? "bg-primary border-primary text-primary-foreground" : "border-muted group-hover:border-primary/50"
                                                                  )}>
                                                                      {selectedFornecedorId === f.id ? <CheckCircle2 className="w-4 h-4" /> : null}
                                                                  </div>
                                                              </button>
                                                          ))
                                                      )}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              )}
                        </div>
                    )}

                    {/* PASSO 2: Dados do Cliente */}
                    {emissaoStep === 2 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">2. Verificação do Destinatário</p>
                                <div className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
                                    {emissaoTipo === 'vincular' ? 'Dados do Pedido' : emissaoTipo === 'avulsa' ? 'Cliente Avulso' : emissaoTipo === 'devolucao' ? 'Devolução de Cliente' : 'Devolução a Fornecedor'}
                                </div>
                            </div>
                            
                            {/* Objeto para exibição unificada */}
                            {(() => {
                                const cli = emissaoTipo === 'vincular' 
                                    ? vendaSelecionadaObj?.clientes 
                                    : emissaoTipo === 'avulsa' 
                                        ? clienteSelecionadoManual 
                                        : emissaoTipo === 'devolucao'
                                            ? devolucaoSelecionadaObj?.clientes
                                            : fornecedorSelecionadoObj;
                                return (
                                    <div className="p-6 border border-primary/20 rounded-3xl space-y-6 bg-primary/[0.03] shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 -mr-16 -mt-16 rounded-full group-hover:scale-110 transition-transform duration-700" />
                                        
                                        {isEditingClient ? (
                                            <div className="relative z-10 space-y-4 bg-background p-5 rounded-2xl border shadow-lg animate-in fade-in zoom-in-95">
                                                <div className="flex items-center justify-between border-b pb-3">
                                                    <p className="text-xs font-black uppercase text-primary">Completar Dados Fiscais</p>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingClient(false)}>
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1 relative">
                                                        <Label className="text-[10px] font-bold">CPF/CNPJ</Label>
                                                        <Input value={clientEditForm.documento} onChange={e => setClientEditForm({...clientEditForm, documento: e.target.value})} className="h-9 text-xs" />
                                                        {searchingDataForm && clientEditForm.documento.replace(/\D/g, '').length === 14 && (
                                                            <Loader2 className="absolute right-3 top-6 w-4 h-4 text-primary animate-spin" />
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-bold">Inscrição Estadual</Label>
                                                        <Input value={clientEditForm.inscricao_estadual} placeholder="Isento (se vazio)" onChange={e => setClientEditForm({...clientEditForm, inscricao_estadual: e.target.value})} className="h-9 text-xs" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/10 p-3 rounded-xl border">
                                                    <div className="md:col-span-3 space-y-1">
                                                        <Label className="text-[10px] font-bold">Rua / Logradouro</Label>
                                                        <Input value={clientEditForm.rua} onChange={e => setClientEditForm({...clientEditForm, rua: e.target.value})} className="h-8 text-xs bg-background" placeholder="Sua Rua" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] font-bold">Número</Label>
                                                        <Input value={clientEditForm.numero} onChange={e => setClientEditForm({...clientEditForm, numero: e.target.value})} className="h-8 text-xs bg-background" placeholder="S/N" />
                                                    </div>
                                                    <div className="md:col-span-2 space-y-1">
                                                        <Label className="text-[10px] font-bold">Bairro</Label>
                                                        <Input value={clientEditForm.bairro} onChange={e => setClientEditForm({...clientEditForm, bairro: e.target.value})} className="h-8 text-xs bg-background" placeholder="Seu Bairro" />
                                                    </div>
                                                    <div className="md:col-span-2 space-y-1">
                                                        <Label className="text-[10px] font-bold">Complemento</Label>
                                                        <Input value={clientEditForm.complemento} onChange={e => setClientEditForm({...clientEditForm, complemento: e.target.value})} className="h-8 text-xs bg-background" placeholder="Apto, Sala, etc" />
                                                    </div>
                                                    <div className="md:col-span-1 space-y-1 relative">
                                                        <Label className="text-[10px] font-bold">CEP</Label>
                                                        <Input value={clientEditForm.cep} onChange={e => setClientEditForm({...clientEditForm, cep: e.target.value})} className="h-8 text-xs bg-background pr-8" placeholder="00000-000" />
                                                        {searchingDataForm && clientEditForm.cep.replace(/\D/g, '').length === 8 && (
                                                            <Loader2 className="absolute right-2 top-[22px] w-3 h-3 text-primary animate-spin" />
                                                        )}
                                                    </div>
                                                    <div className="md:col-span-2 space-y-1">
                                                        <Label className="text-[10px] font-bold">Cidade</Label>
                                                        <Input value={clientEditForm.cidade} onChange={e => setClientEditForm({...clientEditForm, cidade: e.target.value})} className="h-8 text-xs bg-background" placeholder="Sua Cidade" />
                                                    </div>
                                                    <div className="md:col-span-1 space-y-1">
                                                        <Label className="text-[10px] font-bold">Estado (UF)</Label>
                                                        <Input value={clientEditForm.estado} onChange={e => setClientEditForm({...clientEditForm, estado: e.target.value})} className="h-8 text-xs bg-background" placeholder="SP" maxLength={2} />
                                                    </div>
                                                </div>
                                                <div className="flex justify-end pt-2">
                                                    <Button size="sm" onClick={() => handleSaveClientEdit(cli?.id)} disabled={savingClient} className="h-8 font-bold">
                                                        {savingClient ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                                        Salvar Cliente
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex gap-5 relative z-10">
                                                    <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-lg shadow-primary/20 rotate-3 group-hover:rotate-0 transition-transform">
                                                        <User className="w-8 h-8" />
                                                    </div>
                                                    <div className="space-y-1 min-w-0 flex-1">
                                                        <div className="flex justify-between items-start">
                                                            <p className="text-[10px] text-primary uppercase font-black tracking-widest opacity-70">Identificação Fiscal</p>
                                                            {emissaoTipo !== 'devolucao_compra' && (
                                                                <div className="flex gap-2">
                                                                    <Button variant="outline" size="sm" className="h-6 px-3 text-[10px] font-bold tracking-wider bg-background/50 hover:bg-primary/10 hover:text-primary transition-colors border-primary/20" onClick={() => {
                                                                        // Simple Address Parser to populate boxes from "Rua, Num Comp - Bairro, Cidade - UF, CEP X"
                                                                        let r = cli?.endereco || '', num = '', br = '', comp = '', cid = '', est = '', cp = '';
                                                                        try {
                                                                            if (r.includes('CEP:')) {
                                                                                const parts = r.split('CEP:');
                                                                                cp = parts[1].trim();
                                                                                r = parts[0].replace(/,\s*$/, '').trim();
                                                                            }
                                                                            if (r.includes(' - ')) {
                                                                                const hBlocks = r.split(' - ');
                                                                                // Usually: [0] = rua, num, [1] = bairro, cidade, [2] = uf
                                                                                if (hBlocks.length >= 2) {
                                                                                    const pRua = hBlocks[0].split(',');
                                                                                    r = pRua[0].trim();
                                                                                    if (pRua[1]) {
                                                                                        const nMatch = pRua[1].trim().match(/^(\S+)\s*(.*)/);
                                                                                        num = nMatch ? nMatch[1] : pRua[1].trim();
                                                                                        comp = nMatch ? nMatch[2] : '';
                                                                                    }
                                                                                    const pBai = hBlocks[1].split(',');
                                                                                    br = pBai[0].trim();
                                                                                    if (pBai[1]) cid = pBai[1].trim();
                                                                                    if (hBlocks[2]) est = hBlocks[2].replace(/,/g, '').trim();
                                                                                }
                                                                            }
                                                                        } catch(e) {}
                                                                        if (!r) r = cli?.endereco || ''; // fallback put everything in Rua
                                                                        
                                                                        setClientEditForm({ 
                                                                            documento: cli?.documento || '', 
                                                                            inscricao_estadual: cli?.inscricao_estadual || '',
                                                                            rua: r, numero: num, bairro: br, complemento: comp, cidade: cid, estado: est, cep: cp
                                                                        });
                                                                        setIsEditingClient(true);
                                                                    }}>
                                                                        <FileEdit className="w-3 h-3 mr-1.5" /> Editar Cadastro
                                                                    </Button>
                                                                    <Button variant="outline" size="sm" className="h-6 px-3 text-[10px] font-bold tracking-wider bg-primary/5 hover:bg-primary/10 text-primary border-primary/20" onClick={() => setIsCreatingNewClient(true)}>
                                                                        <Plus className="w-3 h-3 mr-1.5" /> Novo Cliente
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <p className="text-xl font-black text-foreground leading-tight truncate">
                                                            {cli?.razao_social || cli?.nome || (emissaoTipo === 'devolucao_compra' ? 'Fornecedor' : 'Consumidor Final')}
                                                        </p>
                                                        <p className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-full inline-block border border-primary/10">
                                                            Doc: {cli?.cnpj || cli?.documento || 'NÃO INFORMADO'} {cli?.inscricao_estadual ? ` • IE: ${cli.inscricao_estadual}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-primary/10 relative z-10">
                                                    <div className="flex gap-3 items-start">
                                                        <div className="w-8 h-8 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 border">
                                                            <Package className="w-4 h-4 text-muted-foreground" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter">Local de Entrega / Faturamento</p>
                                                            <p className="text-xs font-medium leading-relaxed">
                                                                {cli?.endereco ? (
                                                                    `${cli.endereco}${cli.cidade ? ` - ${cli.cidade}` : ''}${cli.estado || cli.uf ? `/${cli.estado || cli.uf}` : ''}`
                                                                ) : <span className="text-amber-600 font-bold bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">Endereço ausente no cadastro</span>}
                                                            </p>
                                                            <div className="mt-3 space-y-1.5">
                                                                <Label className="text-[9px] uppercase font-black text-primary/50 tracking-widest">Código IBGE (Município)</Label>
                                                                <div className="flex items-center gap-2">
                                                                    <Input 
                                                                        value={codigoIbgeDestinatario}
                                                                        onChange={(e) => setCodigoIbgeDestinatario(e.target.value)}
                                                                        className="h-8 text-[11px] font-mono border-primary/20 bg-primary/5 w-40"
                                                                        placeholder={loadingIbge ? "Buscando..." : "Código IBGE"}
                                                                    />
                                                                    <div className="h-8 flex items-center px-2 rounded-md bg-muted/30 text-[10px] font-mono">
                                                                        {loadingIbge ? (
                                                                            <span className="flex items-center gap-1 text-primary"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</span>
                                                                        ) : (
                                                                            codigoIbgeDestinatario ? <span className="text-emerald-600 font-bold flex items-center gap-1">OK ✓</span> : <span className="text-amber-600 font-bold flex items-center gap-1">Pendente ⚠</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-start gap-3 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                                                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-black text-amber-700 uppercase">Validação Legal</p>
                                                            <p className="text-[10px] text-amber-600/80 leading-snug">
                                                                Certifique-se que o CPF/CNPJ pertença ao endereço informado. A SEFAZ exige ao menos Logradouro, Número, Bairro, Cidade, UF e CEP (na mesma linha).
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* PASSO 3: Dados de Transporte (Frete) */}
                    {emissaoStep === 3 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">3. Modalidade de Frete</p>
                            <div className="space-y-4 p-5 border border-border rounded-2xl bg-muted/10">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-primary/70">Quem paga o frete?</Label>
                                    <select 
                                        value={modalidadeFrete} 
                                        onChange={(e) => setModalidadeFrete(e.target.value)} 
                                        className="w-full h-10 rounded-xl border border-input bg-background px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 transition-all"
                                    >
                                        <option value="9">9 – Sem frete (padrão)</option>
                                        <option value="0">0 – Por conta do emitente (CIF)</option>
                                        <option value="1">1 – Por conta do destinatário (FOB)</option>
                                        <option value="2">2 – Por conta de terceiros</option>
                                    </select>
                                </div>

                                {modalidadeFrete !== "9" && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold uppercase tracking-wider text-primary/70">Buscar Transportadora Cadastrada</Label>
                                            <div className="relative group">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                <Input 
                                                    placeholder="Digite nome, razão social ou CNPJ..."
                                                    className="pl-10 h-10 bg-background border-primary/20 focus-visible:ring-2 focus-visible:ring-primary/20"
                                                    value={transportadoraSearchTerm}
                                                    onChange={(e) => setTransportadoraSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            {/* Lista de Resultados */}
                                            {(transportadoraSearchTerm || debouncedTransportadoraSearchTerm || loadingTransportadoras) && (
                                                <div className="mt-1 border rounded-xl bg-background shadow-lg overflow-hidden max-h-48 overflow-y-auto z-50 relative custom-scrollbar">
                                                    {loadingTransportadoras ? (
                                                        <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
                                                    ) : transportadoras.length === 0 ? (
                                                        <p className="p-4 text-center text-xs text-muted-foreground italic">Nenhuma transportadora encontrada...</p>
                                                    ) : (
                                                        transportadoras.map(t => (
                                                            <button 
                                                                type="button"
                                                                key={t.id}
                                                                onClick={() => handleSelectTransportadora(t)}
                                                                className="w-full text-left p-3 hover:bg-primary/5 transition-colors border-b last:border-0 flex items-center justify-between group"
                                                            >
                                                                <div className="min-w-0">
                                                                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{t.nome}</p>
                                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                                        {t.documento || 'Sem CNPJ'} {t.razao_social ? ` • ${t.razao_social}` : ''}
                                                                    </p>
                                                                </div>
                                                                <Truck className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold">Nome da Transportadora / Motorista</Label>
                                                <Input 
                                                    value={freteTransportadora} 
                                                    onChange={(e) => setFreteTransportadora(e.target.value)} 
                                                    placeholder="Preenchimento automático ou manual" 
                                                    className="h-10 text-sm border-primary/10" 
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold">CNPJ/CPF Transportadora</Label>
                                                <Input 
                                                    value={freteCnpj} 
                                                    onChange={(e) => setFreteCnpj(e.target.value)} 
                                                    placeholder="00.000.000/0000-00" 
                                                    className="h-10 text-sm border-primary/10" 
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold">Placa do Veículo</Label>
                                                <Input 
                                                    value={freteVeiculoPlaca} 
                                                    onChange={(e) => setFreteVeiculoPlaca(e.target.value)} 
                                                    placeholder="AAA-0000" 
                                                    className="h-10 text-sm border-primary/10 uppercase" 
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold">Valor do Frete (R$)</Label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">R$</span>
                                                    <Input 
                                                        type="number" 
                                                        value={freteValor} 
                                                        onChange={(e) => setFreteValor(e.target.value)} 
                                                        placeholder="0,00" 
                                                        className="h-10 pl-9 text-sm border-primary/10" 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 mt-4 border-t border-primary/10">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-3">Volumes e Pesos (Opcional)</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">Qtd. Volumes</Label>
                                            <Input 
                                                type="number" 
                                                value={freteQtdVolumes} 
                                                onChange={(e) => setFreteQtdVolumes(e.target.value)} 
                                                placeholder="Ex: 2" 
                                                className="h-10 text-sm border-primary/10" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">Espécie (Volume)</Label>
                                            <Input 
                                                value={freteEspecieVolumes} 
                                                onChange={(e) => setFreteEspecieVolumes(e.target.value)} 
                                                placeholder="Ex: CAIXA, PALETE" 
                                                className="h-10 text-sm border-primary/10 uppercase" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">Peso Bruto (KG)</Label>
                                            <Input 
                                                type="number" 
                                                step="0.001"
                                                value={fretePesoBruto} 
                                                onChange={(e) => setFretePesoBruto(e.target.value)} 
                                                placeholder="0.000" 
                                                className="h-10 text-sm border-primary/10" 
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">Peso Líquido (KG)</Label>
                                            <Input 
                                                type="number" 
                                                step="0.001"
                                                value={fretePesoLiquido} 
                                                onChange={(e) => setFretePesoLiquido(e.target.value)} 
                                                placeholder="0.000" 
                                                className="h-10 text-sm border-primary/10" 
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PASSO 4: Itens e Tributação */}
                    {emissaoStep === 4 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                <span>4. Configuração dos Produtos e Tributação</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-primary font-bold">
                                        {emissaoTipo === 'vincular' 
                                            ? (itensVendaSelecionada.length + ' Itens') 
                                            : emissaoTipo === 'devolucao'
                                                ? (itensDevolucao.length + ' Itens')
                                                : (manualItens.length + ' Itens')
                                        }
                                    </span>
                                    {(emissaoTipo === 'avulsa' || emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') && (
                                        <div className="flex items-center gap-3">
                                            {emissaoTipo === 'entrada_compra' && (
                                                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold border border-border p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={adicionarAoEstoque} 
                                                        onChange={(e) => setAdicionarAoEstoque(e.target.checked)} 
                                                        className="w-3 h-3 text-primary rounded-sm border-primary/20"
                                                    />
                                                    Adicionar ao Estoque
                                                </label>
                                            )}
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-[10px] font-bold border-primary/20 text-primary hover:bg-primary/5"
                                                onClick={() => handleOpenManualItemModal()}
                                            >
                                                <Plus className="w-3 h-3 mr-1" /> Adicionar Item
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </p>

                            <div className="flex bg-muted/20 p-1 rounded-lg border border-border">
                                <button 
                                    onClick={() => setActiveTabPasso4('geral')}
                                    className={cn("flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", activeTabPasso4 === 'geral' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                                >
                                    Tributação Geral
                                </button>
                                <button 
                                    onClick={() => setActiveTabPasso4('produtos')}
                                    className={cn("flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all", activeTabPasso4 === 'produtos' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                                >
                                    Produtos da Venda
                                </button>
                            </div>

                            {activeTabPasso4 === 'geral' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">CFOP principal</Label>
                                        <FiscalSelect
                                            value={cfopPadrao}
                                            onChange={setCfopPadrao}
                                            options={(emissaoTipo === 'entrada_compra' || emissaoTipo === 'devolucao') ? CFOP_ENTRADA : CFOP_SAIDA}
                                            className="text-xs border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">ICMS situação (CSOSN)</Label>
                                        <FiscalSelect
                                            value={normalizeCsosnStored(cstPadrao)}
                                            onChange={setCstPadrao}
                                            options={CSOSN_OPTIONS}
                                            className="text-xs border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">Regime tributário (emitente)</Label>
                                        <FiscalSelect
                                            value={regimeTributarioPadrao}
                                            onChange={setRegimeTributarioPadrao}
                                            options={FISCAL_REGIME_TRIBUTARIO_OPTIONS}
                                            className="text-xs border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">ICMS origem</Label>
                                        <FiscalSelect
                                            value={icmsOrigemPadrao}
                                            onChange={setIcmsOrigemPadrao}
                                            options={ICMS_ORIGEM_OPTIONS}
                                            className="text-xs border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">PIS (saída)</Label>
                                        <FiscalSelect
                                            value={pisSituacaoPadrao}
                                            onChange={setPisSituacaoPadrao}
                                            options={CST_PIS_SAIDA}
                                            className="text-xs border-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-muted-foreground font-black uppercase tracking-wider">COFINS (saída)</Label>
                                        <FiscalSelect
                                            value={cofinsSituacaoPadrao}
                                            onChange={setCofinsSituacaoPadrao}
                                            options={CST_COFINS_SAIDA}
                                            className="text-xs border-primary/20"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                        {(emissaoTipo === 'vincular' 
                                            ? itensVendaSelecionada 
                                            : emissaoTipo === 'devolucao'
                                                ? itensDevolucao
                                                : manualItens
                                        ).map((it: any) => {
                                            const itId = String(it.id);
                                            const currentNcm = itensFiscalOverrides[itId]?.ncm || it.prod_ncm || it.ncm || ncmPadrao;
                                            const currentCest = itensFiscalOverrides[itId]?.cest || it.prod_cest || it.cest || cestPadrao;
                                            
                                            return (
                                                <div key={itId} className="bg-background rounded-xl border border-border p-3 space-y-2 shadow-sm hover:border-primary/30 transition-colors">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-bold text-foreground truncate">
                                                                {it.descricao || it.prod_nome || it.nome || it.produtos?.nome || '(Sem nome)'}
                                                            </p>
                                                            <p className="text-[9px] text-muted-foreground">
                                                                SKU: {it.prod_sku || it.sku || it.produtos?.sku || '---'}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-right">
                                                                <p className="text-[10px] font-bold text-primary">R$ {Number(it.valor_unitario || it.preco_unitario || 0).toFixed(2)}</p>
                                                                <p className="text-[9px] text-muted-foreground">Qtd: {it.quantidade}</p>
                                                            </div>
                                                            {(emissaoTipo === 'avulsa' || emissaoTipo === 'devolucao_compra' || emissaoTipo === 'entrada_compra') && (
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
                                                                        onClick={() => handleOpenManualItemModal(it)}
                                                                    >
                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                                                                        onClick={() => setManualItens(manualItens.filter(m => String(m.id) !== itId))}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] uppercase font-bold text-muted-foreground/70">NCM</Label>
                                                            <Input 
                                                                value={currentNcm} 
                                                                onChange={(e) => setItensFiscalOverrides(prev => ({
                                                                    ...prev,
                                                                    [itId]: { ...prev[itId], ncm: e.target.value.trim() }
                                                                }))}
                                                                className="h-7 text-[10px] font-mono bg-muted/5 focus:bg-background"
                                                                placeholder="87089490"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[9px] uppercase font-bold text-muted-foreground/70">CEST</Label>
                                                            <Input 
                                                                value={currentCest} 
                                                                onChange={(e) => setItensFiscalOverrides(prev => ({
                                                                    ...prev,
                                                                    [itId]: { ...prev[itId], cest: e.target.value }
                                                                }))}
                                                                className="h-7 text-[10px] font-mono bg-muted/5 focus:bg-background"
                                                                placeholder="0107500"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                                        <p className="text-[9px] text-primary leading-tight">
                                            <b>Dica:</b> As alterações feitas aqui serão utilizadas apenas para esta nota. Para salvar permanentemente, atualize o cadastro do produto.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5 bg-amber-50/50 p-3 rounded-xl border border-amber-100 shadow-sm">
                                <Label className="text-[11px] text-foreground font-black uppercase tracking-wider">Informações Adicionais / Observações</Label>
                                <textarea 
                                    value={informacoesComplementares} 
                                    onChange={(e) => setInformacoesComplementares(e.target.value)} 
                                    placeholder="Ex: Garantia de 3 meses, Depósito bancário na conta X..." 
                                    className="w-full min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary transition-all shadow-inner" 
                                />
                            </div>
                        </div>
                    )}

                    {/* PASSO 5: Conferência e Enviar */}
                    {emissaoStep === 5 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 5. Revisão Final do Faturamento
                            </p>
                            
                            <div className="bg-primary/5 border border-primary/20 p-5 rounded-3xl space-y-5 relative overflow-hidden">
                                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
                                
                                <div className="flex justify-between items-center border-b border-primary/10 pb-4 relative z-10">
                                    <span className="text-xs uppercase font-black text-primary tracking-widest">Valor Total Autorizado</span>
                                    <span className="text-2xl font-black text-foreground">
                                        R$ {emissaoTipo === 'vincular' 
                                            ? Number(vendaSelecionadaObj?.total || 0).toFixed(2) 
                                            : emissaoTipo === 'devolucao'
                                                ? totalDevolucao.toFixed(2)
                                                : totalManual.toFixed(2)}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-y-3 text-[11px] relative z-10">
                                    <span className="text-muted-foreground font-medium">Itens a serem faturados:</span>
                                    <span className="text-right font-black text-foreground">
                                        {emissaoTipo === 'vincular' 
                                            ? itensVendaSelecionada.length 
                                            : emissaoTipo === 'devolucao'
                                                ? itensDevolucao.length
                                                : manualItens.length
                                        } produtos
                                    </span>
                                    
                                    <span className="text-muted-foreground font-medium">Destinatário:</span>
                                    <span className="text-right font-black text-foreground truncate pl-10">
                                        {emissaoTipo === 'vincular' 
                                            ? vendaSelecionadaObj?.clientes?.nome 
                                            : emissaoTipo === 'avulsa'
                                                ? clienteSelecionadoManual?.nome
                                                : emissaoTipo === 'devolucao'
                                                    ? devolucaoSelecionadaObj?.clientes?.nome
                                                    : (fornecedorSelecionadoObj?.razao_social || fornecedorSelecionadoObj?.nome)}
                                    </span>

                                    {modalidadeFrete !== "9" && (
                                        <>
                                            <span className="text-muted-foreground font-medium">Frete:</span>
                                            <span className="text-right font-black text-foreground">
                                                {modalidadeFrete === "0" ? "Por conta do emitente (CIF)" : modalidadeFrete === "1" ? "Por conta do destinatário (FOB)" : modalidadeFrete === "2" ? "Por conta de terceiros" : `Modalidade ${modalidadeFrete}`}
                                            </span>

                                            {freteTransportadora && (
                                                <>
                                                    <span className="text-muted-foreground font-medium">Transportadora:</span>
                                                    <span className="text-right font-black text-foreground truncate pl-4">
                                                        {freteTransportadora}
                                                        {!freteCnpj && (
                                                            <span className="text-amber-500 font-normal ml-1">(sem CNPJ)</span>
                                                        )}
                                                    </span>
                                                </>
                                            )}

                                            {freteCnpj && (
                                                <>
                                                    <span className="text-muted-foreground font-medium">CNPJ/CPF Transp.:</span>
                                                    <span className="text-right font-mono text-[10px] text-foreground">{freteCnpj}</span>
                                                </>
                                            )}
                                        </>
                                    )}
                                    
                                    <span className="text-muted-foreground font-medium">Ambiente Sefaz:</span>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1.5 text-emerald-600 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Produção</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-emerald-600/70 italic uppercase">Valor Legal Ativo</span>
                                    </div>
                                </div>
                            </div>

                            {validationErrors.length > 0 && (
                                <div className="p-4 border border-rose-200 bg-rose-50/50 rounded-2xl space-y-3 shadow-sm">
                                    <p className="text-xs font-black text-rose-700 flex items-center gap-2 uppercase tracking-tight">
                                        <AlertCircle className="w-4 h-4" /> Bloqueios de Emissão Detectados
                                    </p>
                                    <ul className="text-[10px] text-rose-600 space-y-1.5 list-disc pl-5 font-medium">
                                        {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                </div>
                            )}

                            {lastFocusError && (
                                <div className="p-4 border border-red-200 bg-red-50 rounded-2xl space-y-3 shadow-sm animate-in fade-in zoom-in-95">
                                    <p className="text-xs font-black text-red-700 flex items-center gap-2 uppercase tracking-tight">
                                        <AlertCircle className="w-4 h-4" /> Resposta Técnica da FocusNFe
                                    </p>
                                    <div className="bg-white/50 p-3 rounded-lg border border-red-100">
                                        <pre className="text-[9px] text-red-600 font-mono overflow-x-auto whitespace-pre-wrap max-h-40 custom-scrollbar">
                                            {JSON.stringify(lastFocusError, null, 2)}
                                        </pre>
                                    </div>
                                    <p className="text-[9px] text-red-500 italic">
                                        Este erro foi retornado diretamente pela API de faturamento. Verifique os campos mencionados.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* NAVEGAÇÃO FOOTER FIXO */}
                    <div className="flex gap-3 pt-6 border-t border-border mt-2">
                        {emissaoStep > 1 && (
                            <Button variant="outline" className="flex-1 h-11 text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-muted transition-all" onClick={prevStep} disabled={emitting}>
                                Voltar
                            </Button>
                        )}
                        {emissaoStep < 5 ? (
                            <Button 
                                className="flex-1 h-11 text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/10" 
                                onClick={nextStep} 
                                disabled={
                                    emissaoTipo === 'vincular' ? !selectedVendaId :
                                    emissaoTipo === 'avulsa' ? !selectedClienteId :
                                    emissaoTipo === 'devolucao' ? (!selectedDevolucaoId || chaveReferenciada.length !== 44) :
                                    emissaoTipo === 'devolucao_compra' ? (!selectedFornecedorId || chaveReferenciada.length !== 44) :
                                    !selectedFornecedorId
                                }
                            >
                                Próximo Passo
                            </Button>
                        ) : (
                            <Button className="flex-1 h-11 text-[11px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 shadow-inner group" onClick={handleEmitirNota} disabled={emitting || (validationErrors.length > 0)}>
                                {emitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (
                                    <>
                                        🚀 Autorizar Nota Fiscal
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </Modal>

            {/* ===== MODAL DE CARTA DE CORREÇÃO (CC-e) ===== */}
            <Modal
                isOpen={isCorrecaoModalOpen}
                onClose={() => {
                    setIsCorrecaoModalOpen(false);
                    setSelectedNotaForCorrecao(null);
                    setCorrecaoTexto("");
                    setCorrecaoResultado(null);
                }}
                title="Emitir Carta de Correção (CC-e)"
            >
                {correcaoResultado ? (
                    <div className="space-y-4 py-2">
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center flex flex-col items-center gap-2 shadow-sm animate-fade-in">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xl font-bold mb-1 shadow-inner shadow-emerald-500/10">✓</div>
                            <h3 className="font-black text-emerald-800 text-sm uppercase tracking-wide">CC-e Autorizada com Sucesso!</h3>
                            <p className="text-xs text-emerald-700 font-medium">
                                {correcaoResultado.xmotivo || correcaoResultado.mensagem_sefaz || "Evento registrado e vinculado à NF-e."}
                            </p>
                        </div>

                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                            <div className="flex justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-slate-500 font-medium">Protocolo:</span>
                                <span className="font-bold text-slate-800">{correcaoResultado.numero_protocolo || "—"}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-slate-500 font-medium">Status SEFAZ:</span>
                                <span className="font-bold text-slate-800">{correcaoResultado.cstat || "135"}</span>
                            </div>
                            <div className="flex flex-col gap-1.5 pt-1">
                                <span className="text-slate-500 font-medium">Texto Corrigido:</span>
                                <p className="bg-white p-2.5 rounded-lg border border-slate-100 text-slate-700 italic font-mono break-words max-h-[120px] overflow-y-auto">
                                    {correcaoTexto}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 rounded-xl shadow-lg shadow-emerald-500/20 gap-2 flex items-center justify-center"
                                onClick={() => {
                                    if (selectedNotaForCorrecao) {
                                        const token = getAuthToken();
                                        const url = `${getApiBaseUrl()}/api/fiscal/nfe/${selectedNotaForCorrecao.id}/download/cce?token=${token}`;
                                        window.open(url, "_blank");
                                    }
                                }}
                            >
                                <Printer className="w-4 h-4" /> Imprimir Carta de Correção (CC-e)
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full h-11 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-bold"
                                onClick={() => {
                                    setIsCorrecaoModalOpen(false);
                                    setSelectedNotaForCorrecao(null);
                                    setCorrecaoTexto("");
                                    setCorrecaoResultado(null);
                                }}
                            >
                                Fechar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <p>
                                    <b>Importante:</b> A CC-e serve para corrigir erros menores que NÃO interfiram nos valores, impostos, quantidades ou datas da nota. O texto deve ter entre 15 e 1000 caracteres.
                                </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold">Texto da Correção</Label>
                            <textarea
                                value={correcaoTexto}
                                onChange={(e) => setCorrecaoTexto(e.target.value)}
                                placeholder="Ex: Correção do endereço do destinatário para Rua X, numero Y..."
                                className="w-full min-h-[150px] rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                            />
                            <p className="text-[10px] text-muted-foreground text-right">
                                {correcaoTexto.length} / 1000 caracteres (mínimo 15)
                            </p>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => setIsCorrecaoModalOpen(false)}
                                disabled={enviandoCorrecao}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 bg-primary font-bold shadow-lg"
                                onClick={handleEnviarCorrecao}
                                disabled={enviandoCorrecao || correcaoTexto.trim().length < 15}
                            >
                                {enviandoCorrecao ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Enviando...
                                    </>
                                ) : "Confirmar Envio"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ===== MODAL DE CANCELAMENTO ===== */}
            <Modal
                isOpen={isCancelamentoModalOpen}
                onClose={() => {
                    setIsCancelamentoModalOpen(false);
                    setSelectedNotaForCancelamento(null);
                    setCancelamentoMotivo("");
                }}
                title="Cancelar Nota Fiscal (NF-e)"
            >
                <div className="space-y-4 py-2">
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[11px] font-bold">Atenção ao prazo regulamentar</p>
                                <p className="text-[10px] opacity-90">O cancelamento reverte todos os efeitos legais da nota. A justificativa deve ter no mínimo 15 caracteres (Regra SEFAZ).</p>
                            </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold">Justificativa do Cancelamento</Label>
                        <textarea
                            value={cancelamentoMotivo}
                            onChange={(e) => setCancelamentoMotivo(e.target.value)}
                            placeholder="Descreva o motivo. Ex: Cancelamos por pedido de alteração de preço do cliente..."
                            className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/20 transition-all shadow-inner"
                        />
                        <p className="text-[10px] text-muted-foreground text-right">
                            {cancelamentoMotivo.length} caracteres (mínimo 15)
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setIsCancelamentoModalOpen(false)}
                            disabled={cancelandoNota}
                        >
                            Voltar
                        </Button>
                        <Button
                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-lg"
                            onClick={handleCancelarNota}
                            disabled={cancelandoNota || cancelamentoMotivo.trim().length < 15}
                        >
                            {cancelandoNota ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processando...
                                </>
                            ) : "Confirmar Cancelamento"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ===== MODAL DE DETALHES DA NOTA ===== */}
            <Modal
                isOpen={isNotaDetalhesOpen}
                onClose={() => {
                    setIsNotaDetalhesOpen(false)
                    setSelectedNotaForDetalhes(null)
                }}
                title={`Detalhes da NF-e ${selectedNotaForDetalhes?.numero_nota ? `#${selectedNotaForDetalhes.numero_nota}` : ''}`}
                className="max-w-2xl"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg border border-border bg-muted/10">
                            <div className="text-muted-foreground">Cliente</div>
                            <div className="font-bold">{selectedNotaForDetalhes?.clientes?.nome || "Consumidor"}</div>
                        </div>
                        <div className="p-3 rounded-lg border border-border bg-muted/10">
                            <div className="text-muted-foreground">Série / Status</div>
                            <div className="font-bold">
                                Série {selectedNotaForDetalhes?.serie || "0"} · {selectedNotaForDetalhes?.status || "—"}
                            </div>
                        </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border">
                        <div className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                            Produtos / Itens
                        </div>
                        {notaItemNames(selectedNotaForDetalhes).length === 0 ? (
                            <div className="text-sm text-muted-foreground italic">
                                Itens não disponíveis nesta nota (não encontrados no payload salvo).
                            </div>
                        ) : (
                            <ul className="space-y-1 text-sm">
                                {notaItemNames(selectedNotaForDetalhes).map((n) => (
                                    <li key={n} className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                                        <span className="font-medium">{n}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {(selectedNotaForDetalhes?.mensagem_status || selectedNotaForDetalhes?.focus_response) && (
                        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 space-y-3">
                            <div className="text-xs font-black uppercase tracking-widest text-rose-700 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Histórico de Resposta e Erros
                            </div>
                            <div className="text-xs text-rose-600 font-medium bg-white/50 p-3 rounded-lg border border-rose-100 italic">
                                {selectedNotaForDetalhes?.mensagem_status || "Sem mensagem descritiva."}
                            </div>
                            {selectedNotaForDetalhes?.focus_response && (
                                <div className="bg-white/40 p-2 rounded-lg border border-rose-100 overflow-hidden">
                                    <pre className="text-[9px] text-rose-500 font-mono overflow-x-auto whitespace-pre-wrap max-h-32 custom-scrollbar">
                                        {JSON.stringify(selectedNotaForDetalhes.focus_response, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>

            {/* ===== MODAL DE INUTILIZAÇÃO (NF-e) ===== */}
            <Modal
                isOpen={isInutilizacaoModalOpen}
                onClose={() => {
                    setIsInutilizacaoModalOpen(false)
                    resetInutilizacaoForm()
                }}
                title="Inutilização de Numeração (NF-e) — Produção"
                className="max-w-2xl"
            >
                <div className="space-y-4 py-2">
                    <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 text-xs">
                        <div className="font-black uppercase tracking-widest">Atenção</div>
                        <div className="mt-1">
                            Inutilização é <b>irreversível</b>. Só use quando existir quebra na sequência e os números <b>não tiverem sido usados</b>.
                            Prazo típico: até o <b>10º dia do mês seguinte</b>.
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Numeração Inicial *</Label>
                            <Input
                                type="number"
                                min="1"
                                value={inutilNumeroInicial}
                                onChange={(e) => setInutilNumeroInicial(e.target.value)}
                                placeholder="Ex: 101"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Numeração Final *</Label>
                            <Input
                                type="number"
                                min="1"
                                value={inutilNumeroFinal}
                                onChange={(e) => setInutilNumeroFinal(e.target.value)}
                                placeholder="Ex: 105"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Série (Geralmente 1)</Label>
                            <Input
                                placeholder="1"
                                value={inutilSerie}
                                onChange={(e) => setInutilSerie(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Ano *</Label>
                            <Input type="number" min="2000" max="2100" value={inutilAno} onChange={(e) => setInutilAno(e.target.value)} />
                        </div>
                    </div>

                    {lastFocusError && (
                        <div className="col-span-2 p-4 border border-rose-200 bg-rose-50 rounded-xl space-y-3 shadow-sm animate-in fade-in zoom-in-95">
                            <p className="text-xs font-black text-rose-700 flex items-center gap-2 uppercase tracking-tight">
                                <AlertCircle className="w-4 h-4" /> Erro na Inutilização (FocusNFe)
                            </p>
                            <div className="bg-white/50 p-3 rounded-lg border border-rose-100">
                                <pre className="text-[9px] text-rose-600 font-mono overflow-x-auto whitespace-pre-wrap max-h-40 custom-scrollbar">
                                    {JSON.stringify(lastFocusError, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <Label>Justificativa (mín. 15 caracteres) *</Label>
                        <textarea
                            value={inutilJustificativa}
                            onChange={(e) => setInutilJustificativa(e.target.value)}
                            placeholder="Ex: Falha técnica no emissor gerou quebra de sequência; numeração não utilizada."
                            className="w-full min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary transition-all shadow-inner"
                        />
                        <div className="text-[10px] text-muted-foreground">
                            {Math.max(0, 15 - inutilJustificativa.trim().length)} caracteres restantes para o mínimo.
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-start gap-2 text-xs">
                            <input
                                type="checkbox"
                                checked={inutilConfirmChecked}
                                onChange={(e) => setInutilConfirmChecked(e.target.checked)}
                                className="mt-0.5"
                            />
                            <span>Confirmo que os números informados não foram usados e desejo inutilizar a faixa em Produção.</span>
                        </label>

                        <div className="space-y-1">
                            <Label>Digite INUTILIZAR para confirmar *</Label>
                            <Input value={inutilConfirmText} onChange={(e) => setInutilConfirmText(e.target.value)} placeholder="INUTILIZAR" />
                        </div>
                    </div>

                    {lastFocusError && (
                        <div className="p-4 border border-red-200 bg-red-50 rounded-2xl space-y-3 shadow-sm animate-in fade-in zoom-in-95">
                            <p className="text-xs font-black text-red-700 flex items-center gap-2 uppercase tracking-tight">
                                <AlertCircle className="w-4 h-4" /> Resposta Técnica da FocusNFe
                            </p>
                            <div className="bg-white/50 p-3 rounded-lg border border-red-100">
                                <pre className="text-[9px] text-red-600 font-mono overflow-x-auto whitespace-pre-wrap max-h-40 custom-scrollbar">
                                    {JSON.stringify(lastFocusError, null, 2)}
                                </pre>
                            </div>
                            <p className="text-[9px] text-red-500 italic">
                                Verifique se o ano e a numeração estão corretos para a série informada.
                            </p>
                        </div>
                    )}

                    <div className="flex gap-2 pt-2">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                                setIsInutilizacaoModalOpen(false)
                                resetInutilizacaoForm()
                            }}
                            disabled={inutilizando}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black"
                            onClick={handleInutilizarNumeracao}
                            disabled={
                                inutilizando ||
                                !inutilNumeroInicial ||
                                !inutilNumeroFinal ||
                                inutilJustificativa.trim().length < 15 ||
                                !inutilConfirmChecked ||
                                inutilConfirmText.trim().toUpperCase() !== "INUTILIZAR"
                            }
                        >
                            {inutilizando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
                            Inutilizar
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal 
                isOpen={isManualItemModalOpen} 
                onClose={() => setIsManualItemModalOpen(false)} 
                title={isEditingManualItem ? "Editar Item" : "Adicionar Item Avulso"}
                className="max-w-xl"
            >
                <div className="space-y-4 p-2">
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-muted-foreground">Nome do Produto</Label>
                        <Input 
                            value={manualItemForm.nome} 
                            onChange={e => {
                                const name = e.target.value;
                                const suggestion = suggestFiscalInfo(name);
                                if (suggestion) {
                                    setManualItemForm({
                                        ...manualItemForm, 
                                        nome: name,
                                        ncm: suggestion.ncm.replace(/\./g, ''),
                                        cest: suggestion.cest.replace(/\./g, '')
                                    });
                                } else {
                                    setManualItemForm({...manualItemForm, nome: name});
                                }
                            }} 
                            className="h-10 text-sm font-bold border-primary/20" 
                            placeholder="Ex: Motor de Partida Recondicionado" 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-muted-foreground">Valor Unitário (R$)</Label>
                            <Input 
                                type="number"
                                value={manualItemForm.valor_unitario} 
                                onChange={e => setManualItemForm({...manualItemForm, valor_unitario: parseFloat(e.target.value) || 0})} 
                                className="h-10 text-sm border-primary/20" 
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-muted-foreground">Quantidade</Label>
                            <Input 
                                type="number"
                                value={manualItemForm.quantidade} 
                                onChange={e => setManualItemForm({...manualItemForm, quantidade: parseFloat(e.target.value) || 1})} 
                                className="h-10 text-sm border-primary/20" 
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 relative">
                            <Label className="text-xs font-bold text-muted-foreground">NCM (8 dígitos)</Label>
                            <div className="flex gap-2">
                                <Input 
                                    value={manualItemForm.ncm} 
                                    onChange={e => setManualItemForm({...manualItemForm, ncm: e.target.value})} 
                                    className="h-10 text-sm font-mono border-primary/20" 
                                    placeholder="87089990" 
                                />
                                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => fetchNcmSuggestions(manualItemForm.nome)}>
                                    {ncmSearchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </Button>
                            </div>
                            {ncmSearchItems.length > 0 && (
                                <div className="absolute z-50 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                    {ncmSearchItems.map((n: any) => (
                                        <button 
                                            key={n.codigo_ncm}
                                            className="w-full text-left p-2 hover:bg-primary/5 text-[10px] border-b last:border-0"
                                            onClick={() => {
                                                setManualItemForm({...manualItemForm, ncm: n.codigo_ncm});
                                                setNcmSearchItems([]);
                                            }}
                                        >
                                            <span className="font-bold">{n.codigo_ncm}</span> - {n.descricao}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1 relative">
                            <Label className="text-xs font-bold text-muted-foreground">CEST (7 dígitos)</Label>
                            <div className="flex gap-2">
                                <Input 
                                    value={manualItemForm.cest} 
                                    onChange={e => setManualItemForm({...manualItemForm, cest: e.target.value})} 
                                    className="h-10 text-sm font-mono border-primary/20" 
                                    placeholder="0107500" 
                                />
                                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => fetchCestSuggestions(manualItemForm.nome)}>
                                    {cestSearchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </Button>
                            </div>
                            {cestSearchItems.length > 0 && (
                                <div className="absolute z-50 mt-1 w-full bg-background border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                    {cestSearchItems.map((c: any) => (
                                        <button 
                                            key={c.codigo_cest}
                                            className="w-full text-left p-2 hover:bg-primary/5 text-[10px] border-b last:border-0"
                                            onClick={() => {
                                                setManualItemForm({...manualItemForm, cest: c.codigo_cest});
                                                setCestSearchItems([]);
                                            }}
                                        >
                                            <span className="font-bold">{c.codigo_cest}</span> - {c.descricao}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {!isEditingManualItem && (
                        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-primary/10">
                            <input 
                                type="checkbox" 
                                id="criar_produto_checkbox"
                                checked={manualItemForm.criar_produto}
                                onChange={e => setManualItemForm({...manualItemForm, criar_produto: e.target.checked})}
                            />
                            <Label htmlFor="criar_produto_checkbox" className="text-xs font-bold cursor-pointer">
                                Cadastrar automaticamente como produto (estoque zero)
                            </Label>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <Button variant="outline" className="flex-1 h-11 font-bold" onClick={() => setIsManualItemModalOpen(false)}>Cancelar</Button>
                        <Button 
                            className="flex-1 h-11 font-black uppercase tracking-wider" 
                            onClick={() => {
                                if (!manualItemForm.nome || !manualItemForm.ncm) {
                                    toast.error("Nome e NCM são obrigatórios");
                                    return;
                                }

                                if (isEditingManualItem && editingManualItemId) {
                                    setManualItens(prev => prev.map(it => it.id === editingManualItemId ? {
                                        ...it,
                                        descricao: manualItemForm.nome,
                                        quantidade: manualItemForm.quantidade,
                                        valor_unitario: manualItemForm.valor_unitario,
                                        valor_total: manualItemForm.quantidade * manualItemForm.valor_unitario,
                                        ncm: manualItemForm.ncm,
                                        cest: manualItemForm.cest
                                    } : it));
                                    toast.success("Item atualizado!");
                                } else {
                                    const newItem = {
                                        id: `manual-${Date.now()}`,
                                        descricao: manualItemForm.nome,
                                        quantidade: manualItemForm.quantidade,
                                        valor_unitario: manualItemForm.valor_unitario,
                                        valor_total: manualItemForm.quantidade * manualItemForm.valor_unitario,
                                        ncm: manualItemForm.ncm,
                                        cest: manualItemForm.cest,
                                        criar_produto: manualItemForm.criar_produto
                                    };
                                    setManualItens([...manualItens, newItem]);
                                    toast.success("Item adicionado!");
                                }

                                setIsManualItemModalOpen(false);
                                setManualItemForm({
                                    nome: '',
                                    valor_unitario: 0,
                                    quantidade: 1,
                                    ncm: '',
                                    cest: '',
                                    criar_produto: true
                                });
                            }}
                        >
                            {isEditingManualItem ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <Plus className="w-5 h-5 mr-2" />}
                            {isEditingManualItem ? "Salvar Alterações" : "Adicionar à Nota"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ===== MODAL EMISSÃO MDF-e ===== */}
            <Modal
                isOpen={isMdfeModalOpen}
                onClose={() => { setIsMdfeModalOpen(false); resetMdfeForm() }}
                title={`Emissão de MDF-e — Passo ${mdfeStep} de 4`}
                className="max-w-3xl"
            >
                <div className="space-y-4 py-2">
                    {/* Stepper */}
                    <div className="flex items-center justify-between px-2 mb-4">
                        {[1,2,3,4].map(s => (
                            <div key={s} className="flex items-center flex-1 last:flex-none">
                                <div className="flex flex-col items-center gap-1">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors shadow-sm ${
                                        mdfeStep === s ? 'bg-blue-600 text-white border-4 border-blue-200' :
                                        mdfeStep > s ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                                    }`}>
                                        {mdfeStep > s ? '✓' : s}
                                    </div>
                                    <span className={`text-[9px] font-bold uppercase tracking-tighter ${mdfeStep === s ? 'text-blue-600' : 'text-muted-foreground'}`}>
                                        {s === 1 ? 'Transporte' : s === 2 ? 'NF-e Vinc.' : s === 3 ? 'Carga' : 'Revisão'}
                                    </span>
                                </div>
                                {s < 4 && <div className={`flex-1 h-0.5 mx-4 -mt-5 ${mdfeStep > s ? 'bg-green-500' : 'bg-muted'}`} />}
                            </div>
                        ))}
                    </div>

                    {/* Passo 1 — Dados do Transporte */}
                    {mdfeStep === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">UF de Início *</Label>
                                    <Input value={mdfeUfInicio} onChange={e => setMdfeUfInicio(e.target.value.toUpperCase())} maxLength={2} placeholder="MS" className="h-10 font-mono uppercase" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">UF de Fim (Destino) *</Label>
                                    <Input value={mdfeUfFim} onChange={e => setMdfeUfFim(e.target.value.toUpperCase())} maxLength={2} placeholder="SP" className="h-10 font-mono uppercase" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Município de Carregamento *</Label>
                                    <div className="flex gap-2">
                                        <Input value={mdfeMunicipioCarregamentoNome} onChange={e => setMdfeMunicipioCarregamentoNome(e.target.value)}
                                            placeholder="Dourados" className="h-10 text-sm flex-1" />
                                        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"
                                            onClick={() => handleBuscarIbgeMdfe(mdfeMunicipioCarregamentoNome, mdfeUfInicio || mdfeUfVeiculo)}
                                            disabled={mdfeBuscandoIbge}>
                                            {mdfeBuscandoIbge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                    {mdfeMunicipioCarregamentoIbge && (
                                        <p className="text-[10px] text-emerald-600 font-mono">IBGE: {mdfeMunicipioCarregamentoIbge}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Código IBGE *</Label>
                                    <Input value={mdfeMunicipioCarregamentoIbge} onChange={e => setMdfeMunicipioCarregamentoIbge(e.target.value)}
                                        placeholder="5003702" className="h-10 font-mono" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1 col-span-2">
                                    <Label className="text-xs font-bold">Placa do Veículo *</Label>
                                    <Input value={mdfePlaca} onChange={e => setMdfePlaca(e.target.value.toUpperCase())} maxLength={8}
                                        placeholder="ABC1D23" className="h-10 font-mono uppercase" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">UF do Veículo</Label>
                                    <Input value={mdfeUfVeiculo} onChange={e => setMdfeUfVeiculo(e.target.value.toUpperCase())} maxLength={2}
                                        placeholder="MS" className="h-10 font-mono uppercase" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-bold">RNTRC (opcional)</Label>
                                <Input value={mdfeRntrc} onChange={e => setMdfeRntrc(e.target.value)} placeholder="12345678" className="h-10 font-mono" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Tipo Emitente</Label>
                                    <select value={mdfeTipoEmitente} onChange={e => setMdfeTipoEmitente(e.target.value)}
                                        className="w-full h-10 border border-input rounded-md px-3 text-sm bg-background">
                                        <option value="1">1 - ETC (Empresa Transportadora)</option>
                                        <option value="2">2 - TAC (Transportador Autônomo)</option>
                                        <option value="3">3 - CTC (Cooperativa)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Tipo Transportador</Label>
                                    <select value={mdfeTipoTransportador} onChange={e => setMdfeTipoTransportador(e.target.value)}
                                        className="w-full h-10 border border-input rounded-md px-3 text-sm bg-background">
                                        <option value="1">1 - ETC</option>
                                        <option value="2">2 - TAC</option>
                                        <option value="3">3 - CTC</option>
                                        <option value="4">4 - Transporte Próprio PJ</option>
                                        <option value="5">5 - Transporte Próprio PF</option>
                                    </select>
                                </div>
                            </div>
                            {/* Condutores */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs font-bold">Condutor(es)</Label>
                                    <Button variant="outline" size="sm" className="h-7 text-xs"
                                        onClick={() => setMdfeCondutores(prev => [...prev, { nome: "", cpf: "" }])}>
                                        <Plus className="w-3 h-3 mr-1" /> Adicionar
                                    </Button>
                                </div>
                                {mdfeCondutores.map((c, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <Input value={c.nome} onChange={e => setMdfeCondutores(prev => prev.map((x, i) => i === idx ? { ...x, nome: e.target.value } : x))}
                                            placeholder="Nome completo" className="h-9 text-sm flex-1" />
                                        <Input value={c.cpf} onChange={e => setMdfeCondutores(prev => prev.map((x, i) => i === idx ? { ...x, cpf: e.target.value } : x))}
                                            placeholder="CPF (11 dígitos)" className="h-9 text-sm w-36 font-mono" maxLength={14} />
                                        {mdfeCondutores.length > 1 && (
                                            <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500"
                                                onClick={() => setMdfeCondutores(prev => prev.filter((_, i) => i !== idx))}>
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Passo 2 — NF-e Vinculadas */}
                    {mdfeStep === 2 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                                    Cole as chaves de acesso das NF-e que estão sendo transportadas neste manifesto (44 dígitos cada).
                                </p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs font-bold">Chaves de Acesso NF-e</Label>
                                    <Button variant="outline" size="sm" className="h-7 text-xs"
                                        onClick={() => setMdfeChavesNfe(prev => [...prev, ""])}>
                                        <Plus className="w-3 h-3 mr-1" /> Adicionar
                                    </Button>
                                </div>
                                {mdfeChavesNfe.map((ch, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <Input value={ch}
                                            onChange={e => setMdfeChavesNfe(prev => prev.map((x, i) => i === idx ? e.target.value.replace(/\D/g,'').slice(0,44) : x))}
                                            placeholder="44 dígitos numéricos" className="h-9 text-xs font-mono flex-1" maxLength={44} />
                                        <span className={`text-[10px] w-8 text-center font-mono ${ch.length === 44 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                            {ch.length}/44
                                        </span>
                                        {mdfeChavesNfe.length > 1 && (
                                            <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500"
                                                onClick={() => setMdfeChavesNfe(prev => prev.filter((_, i) => i !== idx))}>
                                                <X className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <p className="text-[10px] text-muted-foreground">
                                    {mdfeChavesNfe.filter(c => c.length === 44).length} chave(s) válida(s)
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Passo 3 — Dados da Carga */}
                    {mdfeStep === 3 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Valor Total da Carga (R$) *</Label>
                                    <Input value={mdfeValorCarga} onChange={e => setMdfeValorCarga(e.target.value)}
                                        type="number" step="0.01" min="0" placeholder="0,00" className="h-10 font-mono" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Quantidade</Label>
                                    <Input value={mdfeQuantidade} onChange={e => setMdfeQuantidade(e.target.value)}
                                        type="number" step="1" min="1" placeholder="1" className="h-10 font-mono" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-bold">Produto Predominante *</Label>
                                <Input value={mdfeProdutoPredominante} onChange={e => setMdfeProdutoPredominante(e.target.value)}
                                    placeholder="Peças automotivas" className="h-10 text-sm" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-bold">Unidade de Medida</Label>
                                <select value={mdfeUnidadeMedida} onChange={e => setMdfeUnidadeMedida(e.target.value)}
                                    className="w-full h-10 border border-input rounded-md px-3 text-sm bg-background">
                                    <option value="01">01 - M³ (Metro cúbico)</option>
                                    <option value="02">02 - KG (Quilograma)</option>
                                    <option value="03">03 - TON (Tonelada)</option>
                                    <option value="04">04 - UN (Unidade)</option>
                                    <option value="05">05 - L (Litros)</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold">Série</Label>
                                    <Input value={mdfeSerie} onChange={e => setMdfeSerie(e.target.value)} maxLength={3} className="h-10 font-mono" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-bold">Informações Complementares</Label>
                                <textarea value={mdfeInfoComplementares} onChange={e => setMdfeInfoComplementares(e.target.value)}
                                    rows={3} placeholder="Observações adicionais..."
                                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                            </div>
                        </div>
                    )}

                    {/* Passo 4 — Revisão */}
                    {mdfeStep === 4 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="p-3 bg-muted/50 rounded-lg border border-border/50 space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Rota</p>
                                    <p className="font-bold text-base">{mdfeUfInicio || '—'} → {mdfeUfFim || '—'}</p>
                                    <p className="text-xs text-muted-foreground">{mdfeMunicipioCarregamentoNome || mdfeMunicipioCarregamentoIbge}</p>
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg border border-border/50 space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Veículo</p>
                                    <p className="font-bold font-mono text-base">{mdfePlaca || '—'}</p>
                                    <p className="text-xs text-muted-foreground">{mdfeUfVeiculo} · RNTRC: {mdfeRntrc || 'N/A'}</p>
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg border border-border/50 space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Condutores</p>
                                    {mdfeCondutores.filter(c => c.nome).map((c, i) => (
                                        <p key={i} className="text-xs">{c.nome} · {c.cpf}</p>
                                    ))}
                                </div>
                                <div className="p-3 bg-muted/50 rounded-lg border border-border/50 space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Carga</p>
                                    <p className="font-bold">R$ {parseFloat(mdfeValorCarga || '0').toFixed(2)}</p>
                                    <p className="text-xs text-muted-foreground">{mdfeProdutoPredominante}</p>
                                </div>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2">NF-e Vinculadas ({mdfeChavesNfe.filter(c => c.length === 44).length})</p>
                                {mdfeChavesNfe.filter(c => c.length === 44).length === 0 ? (
                                    <p className="text-xs text-amber-600">Nenhuma NF-e vinculada (o MDF-e será emitido sem documentos fiscais)</p>
                                ) : (
                                    <div className="space-y-1">
                                        {mdfeChavesNfe.filter(c => c.length === 44).map((ch, i) => (
                                            <p key={i} className="text-[10px] font-mono text-muted-foreground">{ch}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Rodapé */}
                    <div className="flex gap-3 pt-4 border-t border-border">
                        <Button variant="outline" onClick={() => mdfeStep > 1 ? setMdfeStep(s => s - 1) : setIsMdfeModalOpen(false)}
                            className="flex-1 h-11 font-bold">
                            {mdfeStep === 1 ? 'Cancelar' : <><ChevronLeft className="w-4 h-4 mr-1" /> Voltar</>}
                        </Button>
                        {mdfeStep < 4 ? (
                            <Button onClick={() => setMdfeStep(s => s + 1)} className="flex-1 h-11 font-bold bg-blue-600 hover:bg-blue-700 text-white">
                                Próximo <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                        ) : (
                            <Button onClick={handleEmitirMdfe} disabled={emittingMdfe}
                                className="flex-1 h-11 font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white">
                                {emittingMdfe ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : <><Truck className="w-5 h-5 mr-2" /> Emitir MDF-e</>}
                            </Button>
                        )}
                    </div>
                </div>
            </Modal>

            {/* ===== MODAL ENCERRAMENTO MDF-e ===== */}
            <Modal isOpen={isEncerramentoModalOpen} onClose={() => setIsEncerramentoModalOpen(false)} title="Encerrar MDF-e">
                <div className="space-y-4 p-2">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-700 font-medium">
                            Informe o município e UF onde o transporte foi encerrado (entregue).
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1 col-span-2">
                            <Label className="text-xs font-bold">Município de Encerramento *</Label>
                            <div className="flex gap-2">
                                <Input value={mdfeEncMunicipioNome} onChange={e => setMdfeEncMunicipioNome(e.target.value)}
                                    placeholder="Cidade de entrega" className="h-10 text-sm flex-1" />
                                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"
                                    onClick={() => handleBuscarIbgeMdfeEnc(mdfeEncMunicipioNome, mdfeEncUf)}
                                    disabled={mdfeBuscandoIbgeEnc}>
                                    {mdfeBuscandoIbgeEnc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </Button>
                            </div>
                            {mdfeEncMunicipioIbge && (
                                <p className="text-[10px] text-emerald-600 font-mono">IBGE: {mdfeEncMunicipioIbge}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold">UF *</Label>
                            <Input value={mdfeEncUf} onChange={e => setMdfeEncUf(e.target.value.toUpperCase())}
                                maxLength={2} placeholder="SP" className="h-10 font-mono uppercase" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-bold">Código IBGE *</Label>
                        <Input value={mdfeEncMunicipioIbge} onChange={e => setMdfeEncMunicipioIbge(e.target.value)}
                            placeholder="3550308" className="h-10 font-mono" />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1 h-11 font-bold" onClick={() => setIsEncerramentoModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleEncerrarMdfe} disabled={encerrando}
                            className="flex-1 h-11 font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white">
                            {encerrando ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                            Encerrar MDF-e
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ===== MODAL CANCELAMENTO MDF-e ===== */}
            <Modal isOpen={isCancelMdfeModalOpen} onClose={() => setIsCancelMdfeModalOpen(false)} title="Cancelar MDF-e">
                <div className="space-y-4 p-2">
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-200">
                        <p className="text-xs text-rose-700 font-medium">
                            O cancelamento é irreversível. Informe a justificativa (mínimo 15 caracteres).
                        </p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-bold">Justificativa *</Label>
                        <textarea value={mdfeCancelJustificativa} onChange={e => setMdfeCancelJustificativa(e.target.value)}
                            rows={4} placeholder="Motivo do cancelamento..."
                            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        <p className={`text-[10px] ${mdfeCancelJustificativa.length < 15 ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {mdfeCancelJustificativa.length}/15 caracteres mínimos
                        </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1 h-11 font-bold" onClick={() => setIsCancelMdfeModalOpen(false)}>Voltar</Button>
                        <Button variant="destructive" onClick={handleCancelarMdfe} disabled={cancelandoMdfe || mdfeCancelJustificativa.length < 15}
                            className="flex-1 h-11 font-black uppercase tracking-wider">
                            {cancelandoMdfe ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Ban className="w-5 h-5 mr-2" />}
                            Confirmar Cancelamento
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal de Novo Cliente */}
            <Modal isOpen={isCreatingNewClient} onClose={() => setIsCreatingNewClient(false)} title="Cadastrar Novo Cliente">
                <div className="space-y-4 p-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 col-span-2">
                            <Label className="text-xs font-bold text-muted-foreground">Nome Completo / Razão Social</Label>
                            <Input value={newClientForm.nome} onChange={e => setNewClientForm({...newClientForm, nome: e.target.value})} className="h-10 text-sm font-bold border-primary/20" placeholder="Nome do Cliente" />
                        </div>
                        <div className="space-y-1 relative">
                            <Label className="text-xs font-bold text-muted-foreground">CPF / CNPJ</Label>
                            <Input value={newClientForm.documento} onChange={e => setNewClientForm({...newClientForm, documento: e.target.value})} className="h-10 text-sm font-mono border-primary/20" placeholder="Apenas números" />
                            {searchingDataForm && newClientForm.documento.replace(/\D/g, '').length === 14 && (
                                <Loader2 className="absolute right-3 top-8 w-4 h-4 text-primary animate-spin" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-muted-foreground">Inscrição Estadual</Label>
                            <Input value={newClientForm.inscricao_estadual} onChange={e => setNewClientForm({...newClientForm, inscricao_estadual: e.target.value})} className="h-10 text-sm border-primary/20" placeholder="Isento se vazio" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-muted-foreground">E-mail (NF-e)</Label>
                            <Input value={newClientForm.email} onChange={e => setNewClientForm({...newClientForm, email: e.target.value})} className="h-10 text-sm border-primary/20" placeholder="email@exemplo.com" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-muted-foreground">Telefone</Label>
                            <Input value={newClientForm.telefone} onChange={e => setNewClientForm({...newClientForm, telefone: e.target.value})} className="h-10 text-sm border-primary/20" placeholder="(00) 00000-0000" />
                        </div>
                    </div>

                    <div className="p-4 bg-muted/20 border border-primary/10 rounded-2xl space-y-4">
                        <p className="text-[10px] font-black uppercase text-primary/70">Endereço Fiscal</p>
                        <div className="grid grid-cols-4 gap-3">
                            <div className="col-span-3 space-y-1">
                                <Label className="text-[10px] font-bold">Rua / Logradouro</Label>
                                <Input value={newClientForm.rua} onChange={e => setNewClientForm({...newClientForm, rua: e.target.value})} className="h-9 text-xs" placeholder="Logradouro" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold">Número</Label>
                                <Input value={newClientForm.numero} onChange={e => setNewClientForm({...newClientForm, numero: e.target.value})} className="h-9 text-xs" placeholder="S/N" />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[10px] font-bold">Bairro</Label>
                                <Input value={newClientForm.bairro} onChange={e => setNewClientForm({...newClientForm, bairro: e.target.value})} className="h-9 text-xs" placeholder="Bairro" />
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[10px] font-bold">Complemento</Label>
                                <Input value={newClientForm.complemento} onChange={e => setNewClientForm({...newClientForm, complemento: e.target.value})} className="h-9 text-xs" placeholder="Bloco, Apto..." />
                            </div>
                            <div className="space-y-1 relative">
                                <Label className="text-[10px] font-bold">CEP</Label>
                                <Input value={newClientForm.cep} onChange={e => setNewClientForm({...newClientForm, cep: e.target.value})} className="h-9 text-xs pr-8" placeholder="00000-000" />
                                {searchingDataForm && newClientForm.cep.replace(/\D/g, '').length === 8 && (
                                    <Loader2 className="absolute right-2 top-[22px] w-3 h-3 text-primary animate-spin" />
                                )}
                            </div>
                            <div className="col-span-2 space-y-1">
                                <Label className="text-[10px] font-bold">Cidade</Label>
                                <Input value={newClientForm.cidade} onChange={e => setNewClientForm({...newClientForm, cidade: e.target.value})} className="h-9 text-xs" placeholder="Cidade" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold">UF</Label>
                                <Input value={newClientForm.estado} onChange={e => setNewClientForm({...newClientForm, estado: e.target.value})} className="h-9 text-xs" placeholder="UF" maxLength={2} />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button variant="outline" className="flex-1 h-12 font-bold" onClick={() => setIsCreatingNewClient(false)}>Cancelar</Button>
                        <Button className="flex-1 h-12 font-black uppercase tracking-wider" onClick={handleCreateNewClient} disabled={savingClient}>
                            {savingClient ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                            Confirmar Cadastro
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ===== MODAL DE CONFIRMAÇÃO DE SAÍDA ===== */}
            <Modal
                isOpen={isClosingEmitModalConfirmationOpen}
                onClose={() => setIsClosingEmitModalConfirmationOpen(false)}
                title="Sair da Emissão?"
                className="max-w-md"
            >
                <div className="space-y-6 py-2">
                    <div className="flex flex-col items-center text-center space-y-3">
                        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/20 rounded-full flex items-center justify-center text-rose-600">
                            <AlertCircle className="w-10 h-10" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold">Deseja sair do painel?</h3>
                            <p className="text-sm text-muted-foreground">
                                Todo o progresso não enviado será perdido.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button 
                            variant="outline" 
                            className="flex-1 h-12 font-bold"
                            onClick={() => setIsClosingEmitModalConfirmationOpen(false)}
                        >
                            Não, continuar
                        </Button>
                        <Button 
                            variant="destructive" 
                            className="flex-1 h-12 font-black uppercase tracking-widest"
                            onClick={handleConfirmCloseEmitModal}
                        >
                            Sair
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
