import { useState, useEffect } from "react"
import { 
  UserPlus, 
  MagnifyingGlass, 
  PencilSimple, 
  Trash, 
  X,
  User,
  WhatsappLogo,
  IdentificationCard,
  Camera,
  Check,
  CircleNotch,
  Printer
} from "@phosphor-icons/react"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { normalizeBrazilianPhone } from "@/lib/format"
import { ChatAvatar } from "@/components/ChatAvatar"

interface WhatsAppContact {
  id: string
  telefone: string
  push_name: string | null
  nome_personalizado: string | null
  cliente_id: string | null
  categoria: string | null
  nome_cliente_crm?: string | null
  atendente_nome?: string | null
  vendedor_id: string | null
  foto_url?: string | null
  created_at: string
}

interface ManageContactsModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectContact?: (contact: WhatsAppContact) => void
}



export function ManageContactsModal({ isOpen, onClose, onSelectContact }: ManageContactsModalProps) {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Partial<WhatsAppContact> | null>(null)
  const [allClients, setAllClients] = useState<any[]>([])
  const [searchCategory, setSearchCategory] = useState("")
  const [waCategorias, setWaCategorias] = useState<any[]>([])
  const [clientSearch, setClientSearch] = useState("")
  const [showClientResults, setShowClientResults] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [atendentes, setAtendentes] = useState<any[]>([])
  const [bulkAtendenteId, setBulkAtendenteId] = useState("")
  const [isBulkLinking, setIsBulkLinking] = useState(false)

  const fetchClients = async (query: string = "") => {
    try {
      const url = query ? `/api/clientes?q=${encodeURIComponent(query)}&limit=20` : "/api/clientes?limit=50"
      const data = await api.get(url)
      setAllClients(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Erro ao carregar clientes", err)
    }
  }

  const fetchCategorias = async () => {
    try {
      const data = await api.get("/api/whatsapp/categorias")
      setWaCategorias(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Erro ao carregar categorias", err)
    }
  }

  const fetchAtendentes = async () => {
    try {
      const data = await api.get("/api/atendentes")
      setAtendentes(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Erro ao carregar atendentes", err)
    }
  }

  const fetchContacts = async () => {
    try {
      setLoading(true)
      const data = await api.get("/api/whatsapp/contatos")
      setContacts(data)
    } catch (err) {
      toast.error("Erro ao carregar contatos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchContacts()
      fetchClients("")
      fetchCategorias()
      fetchAtendentes()
    }
  }, [isOpen])

  // Busca debounced de clientes
  useEffect(() => {
    if (!isEditing || !clientSearch || clientSearch.length < 2) return
    
    // Se o search for o nome do cliente já selecionado, não busca
    if (selectedContact?.cliente_id) {
      const currentClient = allClients.find(c => c.id === selectedContact.cliente_id)
      if (currentClient?.nome === clientSearch) return
    }

    const timer = setTimeout(() => {
      fetchClients(clientSearch)
    }, 500)
    return () => clearTimeout(timer)
  }, [clientSearch, isEditing])

  const handleEdit = (contact: WhatsAppContact) => {
    setSelectedContact(contact)
    setIsEditing(true)
    if (contact.cliente_id) {
      const client = allClients.find(c => c.id === contact.cliente_id)
      if (client) {
        setClientSearch(client.nome)
      } else {
        // Busca o cliente específico se não estiver no array atual
        api.get(`/api/clientes/${contact.cliente_id}`).then(c => {
          if (c && c.nome) {
            setAllClients(prev => [...prev, c])
            setClientSearch(c.nome)
          }
        }).catch(() => setClientSearch(""))
      }
    } else {
      setClientSearch("")
    }
  }

  const handleSave = async () => {
    if (!selectedContact) return
    const tel = normalizeBrazilianPhone(selectedContact.telefone)
    if (!tel) {
      toast.error("Telefone é obrigatório")
      return
    }
    const finalContact = { ...selectedContact, telefone: tel }

    try {
      if (finalContact.id) {
        await api.put(`/api/whatsapp/contatos/${finalContact.id}`, finalContact)
        toast.success("Contato atualizado")
      } else {
        await api.post("/api/whatsapp/contatos", finalContact)
        toast.success("Contato criado")
      }
      setIsEditing(false)
      setSelectedContact(null)
      setClientSearch("")
      fetchContacts()
    } catch (err) {
      toast.error("Erro ao salvar contato")
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este contato?")) return
    try {
      await api.delete(`/api/whatsapp/contatos/${id}`)
      toast.success("Contato excluído")
      fetchContacts()
    } catch (err) {
      toast.error("Erro ao excluir contato")
    }
  }

  const handleBulkLink = async () => {
    if (!bulkAtendenteId) {
      toast.error("Selecione um atendente")
      return
    }
    if (selectedIds.length === 0) return

    setIsBulkLinking(true)
    try {
      // Usamos o endpoint de vincular em massa que já existe no backend
      await api.post("/api/whatsapp/contatos/vincular-massa", {
        telefones: contacts.filter(c => selectedIds.includes(c.id)).map(c => c.telefone),
        vendedor_id: bulkAtendenteId
      })
      toast.success(`${selectedIds.length} contatos vinculados com sucesso!`)
      setSelectedIds([])
      setBulkAtendenteId("")
      fetchContacts()
    } catch (err) {
      toast.error("Erro ao vincular contatos em massa")
    } finally {
      setIsBulkLinking(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredContacts.map(c => c.id))
    }
  }

  const handleSelectClient = (client: any) => {
    setSelectedContact(prev => ({ ...(prev || {}), cliente_id: client.id }))
    setClientSearch(client.nome)
    setShowClientResults(false)
  }

  const handleClearClient = () => {
    setSelectedContact(prev => ({ ...(prev || {}), cliente_id: null }))
    setClientSearch("")
    setShowClientResults(false)
  }

  const filteredClients = allClients.slice(0, 10)

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = (c.nome_personalizado?.toLowerCase() || "").includes(search.toLowerCase()) ||
                         (c.push_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
                         c.telefone.includes(search)
    const matchesCategory = !searchCategory || c.categoria === searchCategory
    return matchesSearch && matchesCategory
  })

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Gerenciar Contatos WhatsApp"
      className="max-w-2xl"
    >
      <div className="flex flex-col h-[600px]">
        {isEditing ? (
          <div className="space-y-4 p-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">
                {selectedContact?.id ? "Editar Contato" : "Novo Contato"}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setSelectedContact(null); }}>
                <X size={20} />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Telefone (com DDD)</label>
                <Input 
                  placeholder="Ex: 5567999999999" 
                  value={selectedContact?.telefone || ""} 
                  onChange={e => setSelectedContact({...selectedContact, telefone: e.target.value})}
                  disabled={!!selectedContact?.id}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Nome Personalizado</label>
                <Input 
                  placeholder="Nome para identificação interna" 
                  value={selectedContact?.nome_personalizado || ""} 
                  onChange={e => setSelectedContact({...selectedContact, nome_personalizado: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Contato / Categoria</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedContact?.categoria || ""} 
                  onChange={e => setSelectedContact({...selectedContact, categoria: e.target.value})}
                >
                  <option value="">Selecione uma categoria...</option>
                  {waCategorias.map(cat => (
                    <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 relative">
                <label className="text-xs font-bold text-gray-500 uppercase">Vincular Cliente CRM</label>
                <div className="relative">
                  <Input 
                    placeholder="Pesquisar cliente por nome ou CPF/CNPJ..." 
                    value={clientSearch}
                    onChange={e => {
                      setClientSearch(e.target.value)
                      setShowClientResults(true)
                      if (!e.target.value) {
                        setSelectedContact(prev => ({ ...prev, cliente_id: null }))
                      }
                    }}
                    onFocus={() => setShowClientResults(true)}
                    className="pr-10"
                  />
                  {clientSearch && (
                    <button 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={handleClearClient}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {showClientResults && clientSearch && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowClientResults(false)} />
                    <div className="absolute top-full left-0 w-full mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                      {filteredClients.length > 0 ? (
                        filteredClients.map(client => (
                          <div 
                            key={client.id}
                            className="p-3 hover:bg-emerald-50 cursor-pointer border-b last:border-0"
                            onClick={() => handleSelectClient(client)}
                          >
                            <div className="text-sm font-bold text-gray-700">{client.nome}</div>
                            <div className="text-[10px] text-gray-500">{client.documento || 'Sem documento'}</div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-gray-500 italic">Nenhum cliente encontrado</div>
                      )}
                    </div>
                  </>
                )}
                {selectedContact?.cliente_id && !showClientResults && (
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                    ✓ Vinculado a: {allClients.find(c => c.id === selectedContact.cliente_id)?.nome}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">URL da Foto (Opcional)</label>
                <Input 
                  placeholder="https://..." 
                  value={selectedContact?.foto_url || ""} 
                  onChange={e => setSelectedContact({...selectedContact, foto_url: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Atendente Responsável</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedContact?.vendedor_id || ""} 
                  onChange={e => setSelectedContact({...selectedContact, vendedor_id: e.target.value})}
                >
                  <option value="">Selecione um atendente...</option>
                  {atendentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
                {selectedContact?.atendente_nome && !selectedContact?.vendedor_id && (
                  <p className="text-[10px] text-blue-600 font-bold mt-1">
                    Vinculado via cliente: {selectedContact.atendente_nome}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <Button variant="outline" onClick={() => { setIsEditing(false); setSelectedContact(null); }}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave}>Salvar Contato</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <Input 
                    placeholder="Buscar por nome ou telefone..." 
                    className="pl-10"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <select 
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 min-w-[150px]"
                  value={searchCategory}
                  onChange={e => setSearchCategory(e.target.value)}
                >
                  <option value="">Todas Categorias</option>
                  {waCategorias.map(cat => (
                    <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                  ))}
                </select>
                <Button 
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-[10px] font-black uppercase tracking-tighter px-2 h-10",
                    selectedIds.length === filteredContacts.length && filteredContacts.length > 0 ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700" : "text-gray-500 hover:bg-gray-100"
                  )}
                  onClick={toggleSelectAll}
                >
                  {selectedIds.length === filteredContacts.length && filteredContacts.length > 0 ? "Desmarcar" : "Todos"}
                </Button>
                <Button 
                  variant="outline" 
                  className="gap-2 text-primary border-primary/20 hover:bg-primary/5"
                  onClick={() => window.open('/relatorios?relatorio=contatos_por_atendente', '_blank')}
                  title="Imprimir lista de contatos por atendente"
                >
                  <Printer size={18} />
                </Button>
                <Button 
                  variant="outline" 
                  className="gap-2 text-emerald-600 border-emerald-100 hover:bg-emerald-50"
                  onClick={async () => {
                    try {
                      toast.info("Iniciando atualização de fotos...")
                      await api.post("/api/whatsapp/contatos/refresh-all", {})
                      toast.success("Atualização iniciada em background!")
                    } catch (err) {
                      toast.error("Erro ao iniciar atualização")
                    }
                  }}
                  title="Atualizar fotos de todos os contatos"
                >
                  <Camera size={18} />
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2" onClick={() => { setSelectedContact({}); setIsEditing(true); setClientSearch(""); }}>
                  <UserPlus size={18} />
                  Novo
                </Button>
              </div>

              {selectedIds.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest bg-white px-2 py-1 rounded-md shadow-sm border border-emerald-100">
                      {selectedIds.length} selecionados
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 md:justify-end">
                    <select 
                      className="flex-1 max-w-[200px] h-9 rounded-lg border border-emerald-200 bg-white text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                      value={bulkAtendenteId}
                      onChange={e => setBulkAtendenteId(e.target.value)}
                    >
                      <option value="">Vincular a atendente...</option>
                      {atendentes.map(a => (
                        <option key={a.id} value={a.id}>{a.nome}</option>
                      ))}
                    </select>
                    <Button 
                      size="sm" 
                      className="bg-emerald-600 hover:bg-emerald-700 h-9 font-black uppercase text-[10px] tracking-widest"
                      onClick={handleBulkLink}
                      disabled={isBulkLinking || !bulkAtendenteId}
                    >
                      {isBulkLinking ? <CircleNotch className="animate-spin" size={14} /> : "Vincular em Massa"}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-9 text-gray-500 text-[10px] font-bold uppercase"
                      onClick={() => setSelectedIds([])}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
                  Carregando contatos...
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 italic">
                  Nenhum contato encontrado
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div 
                    key={contact.id} 
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all group",
                      selectedIds.includes(contact.id) ? "bg-emerald-50 border-emerald-200 shadow-sm" : "hover:bg-gray-50 border-transparent hover:border-gray-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(contact.id);
                        }}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                          selectedIds.includes(contact.id) 
                            ? "bg-emerald-600 border-emerald-600 text-white" 
                            : "border-gray-300 bg-white group-hover:border-emerald-500"
                        )}>
                          {selectedIds.includes(contact.id) && <Check size={14} weight="bold" />}
                        </div>
                      </div>
                      <ChatAvatar 
                        src={contact.foto_url}
                        name={contact.nome_personalizado || contact.push_name || "Sem Nome"}
                        telefone={contact.telefone}
                        className="w-10 h-10 border border-emerald-50"
                      />
                      <div>
                        <p className="font-bold text-gray-800">
                          {contact.nome_personalizado || contact.push_name || "Sem Nome"}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <WhatsappLogo size={12} className="text-emerald-500" />
                          {contact.telefone}
                        </p>
                        {contact.categoria && (
                          <span className="text-[9px] bg-blue-50 text-blue-600 font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ml-2">
                            {contact.categoria}
                          </span>
                        )}
                        {(contact.nome_cliente_crm || contact.atendente_nome) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {contact.nome_cliente_crm && (
                              <p className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded inline-block">
                                Cliente: {contact.nome_cliente_crm}
                              </p>
                            )}
                            {contact.atendente_nome && (
                              <p className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded inline-block">
                                Atendente: {contact.atendente_nome}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onSelectContact && (
                        <Button variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50" onClick={() => onSelectContact(contact)}>
                          Abrir
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-blue-600" onClick={() => handleEdit(contact)}>
                        <PencilSimple size={18} />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-red-600" onClick={() => handleDelete(contact.id)}>
                        <Trash size={18} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
