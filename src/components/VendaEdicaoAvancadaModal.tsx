import { useState, useEffect } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2, Plus, Search, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { vendasApi, clientesApi, atendentesApi, estoqueApi } from "@/lib/api"
import { fmt } from "@/lib/format"
import { Textarea } from "@/components/ui/textarea"

interface VendaEdicaoAvancadaModalProps {
    isOpen: boolean
    onClose: () => void
    vendaOriginal: any
    onSuccess: () => void
}

export function VendaEdicaoAvancadaModal({ isOpen, onClose, vendaOriginal, onSuccess }: VendaEdicaoAvancadaModalProps) {
    const [loading, setLoading] = useState(false)
    const [clientes, setClientes] = useState<any[]>([])
    const [vendedores, setVendedores] = useState<any[]>([])
    
    // Form state
    const [clienteId, setClienteId] = useState("")
    const [vendedorId, setVendedorId] = useState("")
    const [itens, setItens] = useState<any[]>([])
    const [carregandoItens, setCarregandoItens] = useState(false)
    const [descontoGlobal, setDescontoGlobal] = useState(0)
    const [saidaCaixa, setSaidaCaixa] = useState(false)
    const [justificativa, setJustificativa] = useState("")

    // Product search
    const [searchProd, setSearchProd] = useState("")
    const [prodResults, setProdResults] = useState<any[]>([])
    const [searchingProd, setSearchingProd] = useState(false)

    // Client search
    const [searchClienteText, setSearchClienteText] = useState("")
    const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false)
    const [searchingCliente, setSearchingCliente] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => {
            if (clienteDropdownOpen) {
                setSearchingCliente(true)
                clientesApi.listar({ q: searchClienteText, limit: 50 }).then(c => {
                    let cList = Array.isArray(c.data) ? c.data : Array.isArray(c) ? c : [];
                    // Ensure the currently selected client is always in the list so its name shows up
                    if (clienteId && !cList.some((cl: any) => cl.id === clienteId)) {
                        const existing = clientes.find(cl => cl.id === clienteId) || (vendaOriginal?.cliente_id === clienteId ? { id: clienteId, nome: vendaOriginal.clientes?.nome } : null);
                        if (existing) cList = [existing, ...cList];
                    }
                    setClientes(cList)
                }).finally(() => setSearchingCliente(false))
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [searchClienteText, clienteDropdownOpen, clienteId, vendaOriginal])

    useEffect(() => {
        if (isOpen && vendaOriginal) {
            setClienteId(vendaOriginal.cliente_id || "")
            setVendedorId(vendaOriginal.vendedor_id || vendaOriginal.atendente_id || "")
            setDescontoGlobal(0)
            setSaidaCaixa(false)
            setJustificativa("")
            // Fetch itens
            // A API devolve os itens em `itens` (GET /api/vendas/{id}); `vendas_itens`
            // é o nome usado só no formato interno de outras telas. Lendo a chave
            // errada, a edição avançada abria sem nenhum item da venda.
            setCarregandoItens(true)
            vendasApi.detalhe(vendaOriginal.id).then(v => {
                const lista = Array.isArray(v?.itens)
                    ? v.itens
                    : Array.isArray(v?.vendas_itens) ? v.vendas_itens : []
                setItens(lista.map((i: any) => ({
                    produto_id: i.produto_id,
                    nome: i.produtos?.nome || i.produto_nome || '(produto sem nome)',
                    quantidade: i.quantidade,
                    preco_unitario: i.preco_unitario,
                    desconto: i.desconto || 0
                })))
            }).catch(() => {
                // Falhar em silêncio aqui é pior: o usuário editaria uma venda
                // achando que ela não tem itens.
                toast.error('Não foi possível carregar os itens da venda.')
            }).finally(() => setCarregandoItens(false))
            // Fetch lists
            if (clientes.length === 0) {
                clientesApi.listar({ limit: 100 }).then(c => {
                    let cList = Array.isArray(c.data) ? c.data : Array.isArray(c) ? c : [];
                    if (vendaOriginal.cliente_id && vendaOriginal.clientes) {
                        if (!cList.some((cl: any) => cl.id === vendaOriginal.cliente_id)) {
                            cList = [{ id: vendaOriginal.cliente_id, nome: vendaOriginal.clientes.nome }, ...cList];
                        }
                    }
                    setClientes(cList);
                });
            } else {
                if (vendaOriginal.cliente_id && vendaOriginal.clientes && !clientes.some((cl: any) => cl.id === vendaOriginal.cliente_id)) {
                    setClientes(prev => [{ id: vendaOriginal.cliente_id, nome: vendaOriginal.clientes.nome }, ...prev]);
                }
            }

            if (vendedores.length === 0) {
                atendentesApi.listar({ limit: 50 }).then(a => {
                    let aList = Array.isArray(a.data) ? a.data : Array.isArray(a) ? a : [];
                    const vendId = vendaOriginal.vendedor_id || vendaOriginal.atendente_id;
                    const vendNome = vendaOriginal.vendedor?.nome || vendaOriginal.atendente?.nome || vendaOriginal.atendentes?.nome;
                    if (vendId && vendNome) {
                        if (!aList.some((al: any) => al.id === vendId)) {
                            aList = [{ id: vendId, nome: vendNome }, ...aList];
                        }
                    }
                    setVendedores(aList);
                });
            } else {
                const vendId = vendaOriginal.vendedor_id || vendaOriginal.atendente_id;
                const vendNome = vendaOriginal.vendedor?.nome || vendaOriginal.atendente?.nome || vendaOriginal.atendentes?.nome;
                if (vendId && vendNome && !vendedores.some((al: any) => al.id === vendId)) {
                    setVendedores(prev => [{ id: vendId, nome: vendNome }, ...prev]);
                }
            }
        }
    }, [isOpen, vendaOriginal])

    const handleSearchProd = async () => {
        if (!searchProd.trim()) return
        setSearchingProd(true)
        try {
            const searchRes = await estoqueApi.listarProdutos({ q: searchProd })
            const prods = Array.isArray(searchRes) ? searchRes : []
            setProdResults(prods)
        } catch (e) {
            toast.error("Erro ao buscar produtos")
        } finally {
            setSearchingProd(false)
        }
    }

    const addItem = (p: any) => {
        setItens([...itens, {
            produto_id: p.id,
            nome: p.nome,
            quantidade: 1,
            preco_unitario: p.preco_venda || 0,
            desconto: 0
        }])
        setSearchProd("")
        setProdResults([])
    }

    const removeItem = (idx: number) => {
        setItens(itens.filter((_, i) => i !== idx))
    }

    const updateItem = (idx: number, field: string, value: number) => {
        const newItens = [...itens]
        newItens[idx][field] = value
        setItens(newItens)
    }

    const subtotal = itens.reduce((acc, i) => acc + ((i.preco_unitario * i.quantidade) - i.desconto), 0)
    const novoTotal = Math.max(0, subtotal - descontoGlobal)
    const antigoTotal = vendaOriginal?.total || 0
    const diferenca = novoTotal - antigoTotal

    const handleSubmit = async () => {
        if (!justificativa.trim()) {
            return toast.error("É obrigatório informar o que foi feito na justificativa.")
        }
        if (itens.length === 0) {
            return toast.error("A venda precisa ter pelo menos um item.")
        }

        setLoading(true)
        try {
            await vendasApi.edicaoAvancada(vendaOriginal.id, {
                cliente_id: clienteId || null,
                atendente_id: vendedorId || null,
                desconto_global: descontoGlobal,
                saida_caixa_reembolso: saidaCaixa,
                justificativa,
                itens: itens.map(i => ({
                    produto_id: i.produto_id,
                    quantidade: i.quantidade,
                    preco_unitario: i.preco_unitario,
                    desconto: i.desconto
                }))
            })
            toast.success("Venda editada com sucesso!")
            onSuccess()
            onClose()
        } catch (e: any) {
            toast.error("Erro ao salvar edição: " + (e.message || "Erro desconhecido"))
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !vendaOriginal) return null

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edição Avançada - Pedido #${vendaOriginal.numero_pedido || vendaOriginal.id.split('-')[0]}`} className="max-w-4xl">
            <div className="space-y-6 max-h-[80vh] overflow-auto p-1">
                <div className="bg-amber-50 text-amber-900 border border-amber-200 p-4 rounded-md flex gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div>
                        <strong>Atenção:</strong> Esta é uma edição retroativa. Alterar itens vai estornar e re-abater do estoque. Reduzir o valor da venda afetará contas a receber pendentes ou, se a conta já estiver paga, gerará saldo para o cliente (ou despesa no caixa). Use com cautela!
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 relative">
                        <Label>Cliente</Label>
                        <div className="relative">
                            {!clienteDropdownOpen ? (
                                <div 
                                    className="border border-input bg-background px-3 py-2 text-sm rounded-md w-full flex justify-between items-center cursor-pointer h-10" 
                                    onClick={() => setClienteDropdownOpen(true)}
                                >
                                    <span className="truncate">{clientes.find(c => c.id === clienteId)?.nome || (vendaOriginal?.clientes?.nome && clienteId === vendaOriginal?.cliente_id ? vendaOriginal.clientes.nome : 'Selecione um cliente...')}</span>
                                    <Search className="w-4 h-4 text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="border border-input bg-background rounded-md w-full p-2 space-y-2 absolute z-50 shadow-lg top-0 left-0">
                                    <Input 
                                        autoFocus
                                        placeholder="Buscar cliente..." 
                                        value={searchClienteText} 
                                        onChange={e => setSearchClienteText(e.target.value)} 
                                    />
                                    {searchingCliente ? (
                                        <div className="text-xs text-muted-foreground p-2">Buscando...</div>
                                    ) : (
                                        <div className="max-h-48 overflow-y-auto">
                                            {clientes.length > 0 ? clientes.map(c => (
                                                <div 
                                                    key={c.id} 
                                                    className="p-2 text-sm hover:bg-slate-100 cursor-pointer rounded transition-colors"
                                                    onClick={() => {
                                                        setClienteId(c.id)
                                                        if (!clientes.find(cl => cl.id === c.id)) {
                                                            setClientes(prev => [c, ...prev])
                                                        }
                                                        setClienteDropdownOpen(false)
                                                    }}
                                                >
                                                    {c.nome}
                                                </div>
                                            )) : (
                                                <div className="text-xs text-muted-foreground p-2">Nenhum cliente encontrado</div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex justify-end p-1">
                                        <Button variant="ghost" size="sm" onClick={() => setClienteDropdownOpen(false)}>Fechar</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Vendedor</Label>
                        <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                            <option value="" disabled>Selecione...</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </Select>
                    </div>
                </div>

                <div className="border rounded-md p-4 space-y-4">
                    <h3 className="font-semibold text-sm">Itens da Venda</h3>
                    <div className="flex gap-2">
                        <Input placeholder="Buscar produto para adicionar..." value={searchProd} onChange={e => setSearchProd(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchProd()} />
                        <Button variant="secondary" onClick={handleSearchProd} disabled={searchingProd}><Search className="w-4 h-4" /></Button>
                    </div>
                    {prodResults.length > 0 && (
                        <div className="border rounded-md max-h-40 overflow-auto bg-slate-50 p-2">
                            {prodResults.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-2 hover:bg-slate-100 text-sm">
                                    <span>{p.nome} ({fmt(p.preco_venda)})</span>
                                    <Button size="sm" variant="outline" onClick={() => addItem(p)}><Plus className="w-4 h-4" /></Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead className="w-24">Qtd</TableHead>
                                <TableHead className="w-28">Preço Un.</TableHead>
                                <TableHead className="w-28">Desconto</TableHead>
                                <TableHead className="w-24">Subtotal</TableHead>
                                <TableHead className="w-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {carregandoItens && itens.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-xs text-center text-muted-foreground py-4">
                                        Carregando itens da venda...
                                    </TableCell>
                                </TableRow>
                            )}
                            {!carregandoItens && itens.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-xs text-center text-muted-foreground py-4">
                                        Esta venda está sem itens. Use a busca acima para adicionar.
                                    </TableCell>
                                </TableRow>
                            )}
                            {itens.map((it, idx) => {
                                const sub = (it.quantidade * it.preco_unitario) - it.desconto
                                return (
                                    <TableRow key={idx}>
                                        <TableCell className="text-xs">{it.nome}</TableCell>
                                        <TableCell><Input type="number" min="1" value={it.quantidade} onChange={e => updateItem(idx, 'quantidade', Number(e.target.value))} className="h-8" /></TableCell>
                                        <TableCell><Input type="number" min="0" step="0.01" value={it.preco_unitario} onChange={e => updateItem(idx, 'preco_unitario', Number(e.target.value))} className="h-8" /></TableCell>
                                        <TableCell><Input type="number" min="0" step="0.01" value={it.desconto} onChange={e => updateItem(idx, 'desconto', Number(e.target.value))} className="h-8" /></TableCell>
                                        <TableCell className="font-mono text-xs">{fmt(sub)}</TableCell>
                                        <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4" /></Button></TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>

                <div className="bg-slate-50 border rounded-md p-4 space-y-4">
                    <h3 className="font-semibold text-sm border-b pb-2">Fechamento e Financeiro</h3>
                    
                    <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                        <div className="space-y-2 w-full sm:w-1/3">
                            <Label>Desconto Global na Venda (R$)</Label>
                            <Input type="number" min="0" step="0.01" value={descontoGlobal} onChange={e => setDescontoGlobal(Number(e.target.value))} />
                        </div>
                        
                        <div className="text-right space-y-1 w-full sm:w-1/3">
                            <div className="text-sm text-slate-500">Valor Original: <span className="font-mono">{fmt(antigoTotal)}</span></div>
                            <div className="text-lg font-bold">Novo Valor: <span className="font-mono text-emerald-600">{fmt(novoTotal)}</span></div>
                            <div className="text-xs font-semibold">
                                Diferença: <span className={diferenca > 0 ? "text-emerald-500" : diferenca < 0 ? "text-rose-500" : "text-slate-500"}>{fmt(diferenca)}</span>
                            </div>
                        </div>
                    </div>

                    {diferenca < 0 && (
                        <div className="bg-rose-50 border border-rose-200 p-3 rounded-md mt-4">
                            <div className="flex items-start space-x-2">
                                <input type="checkbox" id="saida_caixa" checked={saidaCaixa} onChange={(e) => setSaidaCaixa(e.target.checked)} className="w-4 h-4 rounded border-input" />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor="saida_caixa" className="text-sm font-medium leading-none text-rose-900 cursor-pointer">
                                        Devolver diferença em Dinheiro (Sair do Caixa Hoje)
                                    </label>
                                    <p className="text-xs text-rose-700">
                                        Marque isso se o cliente já pagou tudo e você está devolvendo <strong>{fmt(Math.abs(diferenca))}</strong> fisicamente do caixa. Se desmarcar (ou se a venda estava parcelada pendente), o sistema apenas abaterá dívidas ou gerará crédito em Haver para ele.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>Justificativa do que foi feito (obrigatório)</Label>
                    <Textarea 
                        placeholder="Ex: Trocado produto XYZ a pedido do cliente. Adicionado desconto porque peça estava com leve risco..."
                        value={justificativa}
                        onChange={e => setJustificativa(e.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Salvando...' : 'Aplicar Edição Avançada'}</Button>
                </div>
            </div>
        </Modal>
    )
}
