import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { Label } from "@/components/ui/label"
import { MagnifyingGlass, ArrowCounterClockwise, Clock, CheckCircle, Trash, MapPin, User, Hash, CalendarBlank, Warning, Plus, FloppyDisk, NotePencil } from "@phosphor-icons/react"
import { trocasApi, vendasApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { logAcao } from "@/lib/systemLog"
import { formatNumPedido } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Troca {
  id: string
  venda_id: string | null
  numero_pedido: number | null
  vendedor_nome: string | null
  cliente_nome: string | null
  endereco_retirada: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  status: string
  observacoes: string | null
  produto_nome: string | null
  telefone_contato: string | null
  data_coleta: string | null
  created_at: string
}

export function Trocas() {
  const { atendente } = useAuthStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [trocas, setTrocas] = useState<Troca[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState<string>("Pendente")
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [buscandoVenda, setBuscandoVenda] = useState(false)

  const emptyForm = {
    venda_id: "",
    numero_pedido: "",
    vendedor_nome: "",
    cliente_nome: "",
    endereco_logradouro: "",
    endereco_numero: "",
    endereco_bairro: "",
    endereco_cidade: "",
    endereco_uf: "",
    endereco_cep: "",
    status: "Pendente",
    observacoes: "",
    produto_nome: "",
    telefone_contato: "",
    data_coleta: ""
  }
  const [formData, setFormData] = useState(emptyForm)

  const fetchTrocas = async () => {
    setLoading(true)
    try {
      const rows = await trocasApi.listar({ q: searchTerm, status: selectedStatus === "Todas" ? undefined : selectedStatus })
      setTrocas(rows || [])
    } catch (err: any) {
      toast.error("Erro ao carregar trocas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrocas()
  }, [selectedStatus])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchTrocas()
  }

  const openCreateModal = () => {
    setEditingId(null)
    setFormData(emptyForm)
    setIsModalOpen(true)
  }

  const openEditModal = (troca: Troca) => {
    setEditingId(troca.id)
    setFormData({
      venda_id: troca.venda_id || "",
      numero_pedido: troca.numero_pedido ? String(troca.numero_pedido) : "",
      vendedor_nome: troca.vendedor_nome || "",
      cliente_nome: troca.cliente_nome || "",
      endereco_logradouro: troca.endereco_logradouro || "",
      endereco_numero: troca.endereco_numero || "",
      endereco_bairro: troca.endereco_bairro || "",
      endereco_cidade: troca.endereco_cidade || "",
      endereco_uf: troca.endereco_uf || "",
      endereco_cep: troca.endereco_cep || "",
      status: troca.status,
      observacoes: troca.observacoes || "",
      produto_nome: troca.produto_nome || "",
      telefone_contato: troca.telefone_contato || "",
      data_coleta: troca.data_coleta ? troca.data_coleta.split('T')[0] : ""
    })
    setIsModalOpen(true)
  }

  const buscarDadosVenda = async () => {
    if (!formData.numero_pedido) return
    setBuscandoVenda(true)
    try {
      const res = await vendasApi.listar({ numero_pedido: Number(formData.numero_pedido), limit: 1 })
      if (res && res.length > 0) {
        const v = res[0]
        setFormData(prev => ({
          ...prev,
          venda_id: v.id,
          vendedor_nome: v.atendentes?.nome || prev.vendedor_nome,
          cliente_nome: v.clientes?.nome || prev.cliente_nome,
          endereco_logradouro: v.clientes?.endereco_logradouro || "",
          endereco_numero: v.clientes?.endereco_numero || "",
          endereco_bairro: v.clientes?.endereco_bairro || "",
          endereco_cidade: v.clientes?.endereco_cidade || "",
          endereco_uf: v.clientes?.endereco_uf || "",
          endereco_cep: v.clientes?.endereco_cep || "",
          telefone_contato: v.clientes?.telefone || prev.telefone_contato,
          produto_nome: v.vendas_itens?.map((i: any) => i.prod_nome || i.produtos?.nome).filter(Boolean).join(", ") || ""
        }))
        toast.success("Dados da venda carregados!")
      } else {
        toast.error("Venda não encontrada")
      }
    } catch (e) {
      toast.error("Erro ao buscar venda")
    } finally {
      setBuscandoVenda(false)
    }
  }

  const handleSave = async () => {
    setSubmitting(true)
    try {
      const payload = {
        ...formData,
        venda_id: formData.venda_id || null,
        numero_pedido: formData.numero_pedido ? Number(formData.numero_pedido) : null,
      }

      if (editingId) {
        await trocasApi.atualizar(editingId, payload)
        logAcao('troca.atualizar', `Troca ${formData.numero_pedido} atualizada`, atendente?.id)
        toast.success("Troca atualizada!")
      } else {
        await trocasApi.criar(payload)
        logAcao('troca.criar', `Troca manual criada para pedido ${formData.numero_pedido}`, atendente?.id)
        toast.success("Troca criada com sucesso!")
      }
      setIsModalOpen(false)
      fetchTrocas()
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, numero: number | null) => {
    if (!confirm(`Deseja excluir o registro da troca #${numero}?`)) return
    try {
      await trocasApi.deletar(id)
      logAcao('troca.excluir', `Troca ${numero} excluída`, atendente?.id)
      toast.success("Registro removido")
      fetchTrocas()
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pendente':
        return <Badge className="bg-amber-500 hover:bg-amber-600 border-none shadow-sm flex items-center gap-1"><Clock weight="bold" className="w-3 h-3" /> Pendente</Badge>
      case 'Em Processo':
        return <Badge className="bg-blue-500 hover:bg-blue-600 border-none shadow-sm flex items-center gap-1"><ArrowCounterClockwise weight="bold" className="w-3 h-3" /> Em Processo</Badge>
      case 'Concluída':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 border-none shadow-sm flex items-center gap-1"><CheckCircle weight="bold" className="w-3 h-3" /> Concluída</Badge>
      case 'Cancelada':
        return <Badge className="bg-rose-500 hover:bg-rose-600 border-none shadow-sm flex items-center gap-1"><Warning weight="bold" className="w-3 h-3" /> Cancelada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Sistema de Trocas</h1>
          <p className="text-muted-foreground mt-1 font-medium">Controle de trocas de itens de alto valor (Motores e Câmbios).</p>
        </div>
        <Button onClick={openCreateModal} className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all gap-2">
          <Plus weight="bold" className="w-4 h-4" /> Nova Troca
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Pendente", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Em Processo", icon: ArrowCounterClockwise, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Concluída", icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Todas", icon: Hash, color: "text-slate-500", bg: "bg-slate-500/10" },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => setSelectedStatus(item.label)}
            className={cn(
              "flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 hover:shadow-md hover:-translate-y-1 group",
              selectedStatus === item.label ? "bg-card border-primary shadow-sm" : "bg-card/50 border-border/60 hover:border-primary/40"
            )}
          >
            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110", item.bg)}>
              <item.icon weight="duotone" className={cn("w-6 h-6", item.color)} />
            </div>
            <div className="text-left">
              <span className="text-sm font-bold text-foreground block">{item.label}</span>
              <span className="text-xs text-muted-foreground">Filtrar registros</span>
            </div>
          </button>
        ))}
      </div>

      <Card className="border-border/60 bg-card/80 backdrop-blur-sm shadow-xl overflow-hidden rounded-2xl">
        <CardHeader className="pb-4 border-b border-border/40">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 group">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Buscar por cliente, vendedor ou pedido..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-muted/30 border-border/40 hover:bg-muted/50 transition-all rounded-xl focus-visible:ring-primary/20"
              />
            </div>
            <Button type="submit" className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all px-8">
              <MagnifyingGlass className="w-4 h-4 mr-2" /> Buscar
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-border/40">
                  <TableHead className="py-4 font-bold text-foreground">Pedido</TableHead>
                  <TableHead className="py-4 font-bold text-foreground">Vendedor</TableHead>
                  <TableHead className="py-4 font-bold text-foreground">Cliente / Contato</TableHead>
                  <TableHead className="py-4 font-bold text-foreground">Produto</TableHead>
                  <TableHead className="py-4 font-bold text-foreground">Retirada em</TableHead>
                  <TableHead className="py-4 font-bold text-foreground">Status</TableHead>
                  <TableHead className="py-4 font-bold text-foreground text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Clock className="w-8 h-8 animate-spin" />
                        <span className="font-medium">Carregando trocas...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : trocas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground opacity-50">
                        <Warning className="w-12 h-12" />
                        <span className="font-medium text-lg">Nenhuma troca encontrada.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : trocas.map((troca) => (
                  <TableRow key={troca.id} className="hover:bg-muted/20 transition-colors border-border/40 group">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-primary text-sm flex items-center gap-1">
                          #{formatNumPedido(troca.numero_pedido || 0)}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-bold">
                          <CalendarBlank weight="bold" /> {new Date(troca.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User weight="duotone" className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-semibold">{troca.vendedor_nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{troca.cliente_nome || 'Cliente Eventual'}</span>
                        {troca.telefone_contato && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                             {troca.telefone_contato}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-primary/80 line-clamp-2" title={troca.produto_nome || ""}>
                          {troca.produto_nome || '-'}
                        </span>
                        {troca.data_coleta && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded w-fit flex items-center gap-1 mt-1">
                            <CalendarBlank weight="bold" /> Coleta: {new Date(troca.data_coleta).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      <div className="flex items-start gap-2">
                        <MapPin weight="duotone" className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-xs font-medium leading-relaxed">
                          {[
                            troca.endereco_logradouro,
                            troca.endereco_numero,
                            troca.endereco_bairro,
                            troca.endereco_cidade,
                            troca.endereco_uf
                          ].filter(Boolean).join(", ") || troca.endereco_retirada}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(troca.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-all"
                          onClick={() => openEditModal(troca)}
                          title="Editar/Gerenciar"
                        >
                          <NotePencil weight="bold" className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"
                          onClick={() => handleDelete(troca.id, troca.numero_pedido)}
                          title="Excluir"
                        >
                          <Trash weight="bold" className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? `Gerenciar Troca #${formatNumPedido(Number(formData.numero_pedido))}` : "Nova Troca a Retirar"}
        className="max-w-4xl"
      >
        <div className="space-y-6 p-1 max-h-[80vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="font-bold">Nº do Pedido</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Ex: 10234"
                    value={formData.numero_pedido}
                    onChange={(e) => setFormData(prev => ({ ...prev, numero_pedido: e.target.value }))}
                    className="rounded-xl"
                  />
                  <Button 
                    variant="secondary" 
                    className="rounded-xl"
                    onClick={buscarDadosVenda}
                    disabled={buscandoVenda || !formData.numero_pedido}
                    title="Puxar dados do pedido/cliente"
                  >
                    {buscandoVenda ? <Clock className="animate-spin" /> : <ArrowCounterClockwise weight="bold" />}
                  </Button>
                </div>
            </div>
            
            <div className="space-y-2">
              <Label className="font-bold">Vendedor</Label>
              <Input
                placeholder="Nome do vendedor"
                value={formData.vendedor_nome}
                onChange={(e) => setFormData(prev => ({ ...prev, vendedor_nome: e.target.value }))}
                className="rounded-xl"
              />
            </div>

             <div className="space-y-2">
              <Label className="font-bold">Nome do Cliente</Label>
              <Input
                placeholder="Ex: João Silva"
                value={formData.cliente_nome}
                onChange={(e) => setFormData(prev => ({ ...prev, cliente_nome: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold">Produto(s)</Label>
              <Input
                placeholder="Motor, Câmbio..."
                value={formData.produto_nome}
                onChange={(e) => setFormData(prev => ({ ...prev, produto_nome: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold">Status Atual</Label>
              <select
                className="w-full bg-card border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="Pendente">Pendente</option>
                <option value="Em Processo">Em Processo</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">Telefone de Contato</Label>
              <Input
                placeholder="(99) 99999-9999"
                value={formData.telefone_contato}
                onChange={(e) => setFormData(prev => ({ ...prev, telefone_contato: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-bold">Data de Coleta</Label>
              <Input
                type="date"
                value={formData.data_coleta}
                onChange={(e) => setFormData(prev => ({ ...prev, data_coleta: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="md:col-span-2 border-t pt-4 mt-2">
              <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                <MapPin weight="bold" /> Endereço de Retirada
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Logradouro / Rua</Label>
                  <Input
                    placeholder="Rua, Avenida..."
                    value={formData.endereco_logradouro}
                    onChange={(e) => setFormData(prev => ({ ...prev, endereco_logradouro: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Número</Label>
                  <Input
                    placeholder="123"
                    value={formData.endereco_numero}
                    onChange={(e) => setFormData(prev => ({ ...prev, endereco_numero: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Bairro</Label>
                  <Input
                    placeholder="Centro"
                    value={formData.endereco_bairro}
                    onChange={(e) => setFormData(prev => ({ ...prev, endereco_bairro: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Cidade</Label>
                  <Input
                    placeholder="Dourados"
                    value={formData.endereco_cidade}
                    onChange={(e) => setFormData(prev => ({ ...prev, endereco_cidade: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">UF</Label>
                    <Input
                      placeholder="MS"
                      maxLength={2}
                      value={formData.endereco_uf}
                      onChange={(e) => setFormData(prev => ({ ...prev, endereco_uf: e.target.value.toUpperCase() }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">CEP</Label>
                    <Input
                      placeholder="00000-000"
                      value={formData.endereco_cep}
                      onChange={(e) => setFormData(prev => ({ ...prev, endereco_cep: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2 border-t pt-4 mt-2">
              <Label className="font-bold">Observações Internas</Label>
              <textarea
                className="w-full min-h-[100px] bg-muted/30 border border-border/40 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Ex: Motor já foi retirado, esperando chegar na loja..."
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button 
              className="flex-1 rounded-xl h-11 shadow-lg shadow-primary/20 gap-2" 
              onClick={handleSave} 
              disabled={submitting}
            >
              {submitting ? 'Salvando...' : <><FloppyDisk weight="bold" className="w-4 h-4" /> Salvar Troca</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
