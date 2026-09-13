import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Search, MapPin, Play, CheckCircle2, Clock, Calendar, User, Trash2, ChevronRight, Navigation, MoreHorizontal, ListTodo, X, Sparkles, ArrowLeft } from "lucide-react"
import { clientesApi, atendentesApi, logisticaBoletosApi, logisticaGoogleApi } from "@/lib/api"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { Modal } from "@/components/ui/modal"
import { GoogleMap, useJsApiLoader, DirectionsRenderer } from '@react-google-maps/api'

interface Stop {
    id: string
    cliente_id: string
    cliente_nome: string
    endereco: string
    telefone: string
    status: 'Pendente' | 'Iniciada' | 'Entregue' | 'Falhou'
    horario_inicio: string | null
    horario_chegada: string | null
    observacao: string | null
    endereco_logradouro?: string
    endereco_numero?: string
    endereco_bairro?: string
    endereco_cidade?: string
    endereco_uf?: string
}

interface Route {
    id: string
    entregador_id: string
    entregador_nome: string
    status: 'Pendente' | 'Em Rota' | 'Finalizada'
    data_rota: string
    created_at: string
    finalized_at: string | null
    paradas: Stop[]
}

export function LogisticaBoletos() {
    const navigate = useNavigate()
    const { atendente } = useAuthStore()
    const [activeTab, setActiveTab] = useState("minhas-rotas")
    const [rotas, setRotas] = useState<Route[]>([])
    const [loading, setLoading] = useState(false)
    
    // Create Route State
    const [clients, setClients] = useState<any[]>([])
    const [searchClient, setSearchClient] = useState("")
    const [selectedClients, setSelectedClients] = useState<any[]>([])
    const [drivers, setDrivers] = useState<any[]>([])
    const [selectedDriverId, setSelectedDriverId] = useState<string>(atendente?.id || "")
    const [isCreating, setIsCreating] = useState(false)
    const [isOptimizing, setIsOptimizing] = useState(false)

    // Details Modal
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editData, setEditData] = useState({ entregador_id: "", data_rota: "" })

    // Search results for adding stop
    const [searchTerm, setSearchTerm] = useState("")
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)

    // Google Maps States
    const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null)
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""
    })

    const fetchRotas = async () => {
        setLoading(true)
        try {
            const data = await logisticaBoletosApi.listarRotas()
            setRotas(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error(error)
            toast.error("Erro ao carregar rotas")
        } finally {
            setLoading(false)
        }
    }

    const fetchInitialData = async () => {
        try {
            const [driversData] = await Promise.all([
                atendentesApi.listar()
            ])
            setDrivers(Array.isArray(driversData) ? driversData : [])
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        fetchRotas()
        fetchInitialData()
    }, [])

    const handleSearchClients = async () => {
        if (!searchClient.trim()) return
        try {
            const res = await clientesApi.listar({ q: searchClient, limit: 10 })
            // O endpoint /api/clientes/ retorna uma lista direta, não um objeto com .items
            setClients(Array.isArray(res) ? res : [])
        } catch (error) {
            console.error(error)
        }
    }

    const toggleClientSelection = (client: any) => {
        if (selectedClients.find(c => c.id === client.id)) {
            setSelectedClients(selectedClients.filter(c => c.id !== client.id))
        } else {
            setSelectedClients([...selectedClients, client])
        }
    }

    const handleOptimizeRoute = async () => {
        if (selectedClients.length < 2) {
            return toast.error("Adicione ao menos 2 clientes para otimizar")
        }

        setIsOptimizing(true)
        try {
            // Extrair endereços formatados e filtrar vazios
            const destinos = (selectedClients || []).map(c => {
                const parts = [
                    c.endereco_logradouro,
                    c.endereco_numero,
                    c.endereco_bairro,
                    c.endereco_cidade,
                    c.endereco_uf
                ].filter(p => !!p && p.trim() !== "")
                return parts.join(", ")
            }).filter(addr => addr.length > 5)

            if (destinos.length < 2) {
                return toast.error("Selecione ao menos 2 clientes com endereços válidos para otimizar")
            }

            const res = await logisticaGoogleApi.otimizar(destinos)
            
            if (res && Array.isArray(res.waypoint_order)) {
                // Reordenar selectedClients baseado no waypoint_order
                const newOrder = res.waypoint_order.map((idx: number) => selectedClients[idx])
                setSelectedClients(newOrder)
                toast.success("Rota otimizada com sucesso!")
            } else {
                toast.error("O Google não conseguiu otimizar a rota, mas você ainda pode gerar a rota manualmente.")
            }
        } catch (error: any) {
            console.error(error)
            toast.error(error.message || "Erro ao otimizar rota")
        } finally {
            setIsOptimizing(false)
        }
    }

    const handleOptimizeExistingRoute = async () => {
        if (!selectedRoute || !Array.isArray(selectedRoute.paradas) || selectedRoute.paradas.length < 2) {
            return toast.error("Necessário ao menos 2 paradas para otimizar")
        }

        if (!isLoaded) return toast.error("Mapa ainda não carregado")

        setIsOptimizing(true)
        try {
            const directionsService = new google.maps.DirectionsService()
            
            const origin = "Dourados Auto Peças, Dourados, MS"
            
            // Filtrar apenas paradas que possuem endereço válido
            const validStops = selectedRoute.paradas.filter(p => 
                p.endereco_logradouro && p.endereco_logradouro.trim() !== ""
            )

            if (validStops.length < 1) {
                return toast.error("Nenhum cliente nesta rota possui endereço cadastrado para otimização.")
            }

            if (validStops.length < selectedRoute.paradas.length) {
                toast.info(`${selectedRoute.paradas.length - validStops.length} paradas foram ignoradas por falta de endereço.`)
            }

            const waypoints = validStops.map(p => ({
                location: `${p.endereco_logradouro}, ${p.endereco_numero}, ${p.endereco_bairro}, ${p.endereco_cidade}, ${p.endereco_uf}`,
                stopover: true
            }))

            const result = await directionsService.route({
                origin: origin,
                destination: origin,
                waypoints: waypoints,
                optimizeWaypoints: true,
                travelMode: google.maps.TravelMode.DRIVING,
            })

            if (result && result.routes[0]) {
                setDirectionsResponse(result)
                const waypointOrder = result.routes[0].waypoint_order

                // Reordenar baseado no waypoint_order do Google JS SDK (apenas as paradas válidas)
                const reordered = waypointOrder.map((originalIdx: number, newPosition: number) => ({
                    id: validStops[originalIdx].id,
                    ordem: newPosition
                }))
                
                await logisticaBoletosApi.reordenarParadas(reordered)
                toast.success("Rota otimizada pelo GPS e mapa atualizado!")
                
                // Recarregar rotas para atualizar a interface
                const data = await logisticaBoletosApi.listarRotas()
                const updatedRotas = Array.isArray(data) ? data : []
                setRotas(updatedRotas)
                
                const current = updatedRotas.find(r => r.id === selectedRoute.id)
                if (current) setSelectedRoute(current)
            }
        } catch (error: any) {
            console.error(error)
            toast.error("Erro ao otimizar rota no mapa")
        } finally {
            setIsOptimizing(false)
        }
    }

    const handleRemoveStop = async (paradaId: string) => {
        if (!confirm("Deseja remover esta parada da rota?")) return

        try {
            await logisticaBoletosApi.removerParada(paradaId)
            toast.success("Parada removida!")
            fetchRotas()
            if (selectedRoute) {
                const updatedParadas = selectedRoute.paradas.filter(p => p.id !== paradaId)
                setSelectedRoute({ ...selectedRoute, paradas: updatedParadas })
            }
        } catch (error) {
            toast.error("Erro ao remover parada")
        }
    }

    const handleAddStop = async (clienteId: string) => {
        if (!selectedRoute) return

        try {
            await logisticaBoletosApi.adicionarParada(selectedRoute.id, clienteId, selectedRoute.paradas.length)
            toast.success("Cliente adicionado à rota!")
            fetchRotas()
            const data = await logisticaBoletosApi.listarRotas()
            const updatedRotas = Array.isArray(data) ? data : []
            const current = updatedRotas.find(r => r.id === selectedRoute.id)
            if (current) setSelectedRoute(current)
        } catch (error) {
            toast.error("Erro ao adicionar cliente")
        }
    }

    const handleSearchCustomers = async (term: string) => {
        setSearchTerm(term)
        if (term.length < 2) {
            setSearchResults([])
            return
        }

        setIsSearching(true)
        try {
            const data = await clientesApi.listar({ q: term, limit: 5 })
            setSearchResults(Array.isArray(data) ? data : [])
        } catch (error) {
            console.error(error)
        } finally {
            setIsSearching(false)
        }
    }

    const handleCreateRoute = async () => {
        if (!selectedDriverId) return toast.error("Selecione um entregador")
        if (selectedClients.length === 0) return toast.error("Selecione ao menos um cliente")

        setIsCreating(true)
        try {
            await logisticaBoletosApi.criarRota({
                entregador_id: selectedDriverId,
                paradas: selectedClients.map((c, i) => ({
                    cliente_id: c.id,
                    ordem: i,
                    observacao: ""
                }))
            })
            toast.success("Rota criada com sucesso!")
            setSelectedClients([])
            setSearchClient("")
            setClients([])
            setActiveTab("minhas-rotas")
            fetchRotas()
        } catch (error) {
            console.error(error)
            toast.error("Erro ao criar rota")
        } finally {
            setIsCreating(false)
        }
    }

    const handleDeleteRoute = async (id: string) => {
        if (!window.confirm("Deseja realmente excluir esta rota? Todas as paradas vinculadas também serão removidas.")) return
        
        try {
            await logisticaBoletosApi.deletarRota(id)
            toast.success("Rota excluída com sucesso")
            fetchRotas()
            if (selectedRoute?.id === id) {
                setIsDetailsOpen(false)
            }
        } catch (error) {
            console.error(error)
            toast.error("Erro ao excluir rota")
        }
    }

    const handleUpdateRoute = async () => {
        if (!selectedRoute) return
        try {
            await logisticaBoletosApi.atualizarRota(selectedRoute.id, editData)
            toast.success("Rota atualizada com sucesso")
            setIsEditOpen(false)
            fetchRotas()
        } catch (error) {
            console.error(error)
            toast.error("Erro ao atualizar rota")
        }
    }

    const handleStartStop = async (paradaId: string) => {
        try {
            await logisticaBoletosApi.atualizarParada(paradaId, {
                status: 'Iniciada',
                horario_inicio: new Date().toISOString()
            })
            toast.info("Entrega iniciada!")
            fetchRotas()
            if (selectedRoute) {
                // update local state for modal
                const updated = rotas.find(r => r.id === selectedRoute.id)
                if (updated) setSelectedRoute(updated)
            }
        } catch (error) {
            toast.error("Erro ao iniciar entrega")
        }
    }

    const handleFinishStop = async (paradaId: string) => {
        try {
            await logisticaBoletosApi.atualizarParada(paradaId, {
                status: 'Entregue',
                horario_chegada: new Date().toISOString()
            })
            toast.success("Entrega finalizada!")
            fetchRotas()
        } catch (error) {
            toast.error("Erro ao finalizar entrega")
        }
    }

    const handleFinalizeRoute = async (rotaId: string) => {
        try {
            await logisticaBoletosApi.atualizarRota(rotaId, {
                status: 'Finalizada'
            })
            toast.success("Rota finalizada!")
            fetchRotas()
        } catch (error) {
            toast.error("Erro ao finalizar rota")
        }
    }

    const openGoogleMaps = (stop: Stop) => {
        const addr = [
            stop.endereco_logradouro,
            stop.endereco_numero,
            stop.endereco_bairro,
            stop.endereco_cidade,
            stop.endereco_uf
        ].filter(Boolean).join(", ") || stop.endereco
        
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
        window.open(url, '_blank')
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/entregas')} title="Voltar para Entregas">
                    <ArrowLeft className="w-6 h-6" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Logística de Boletos</h1>
                    <p className="text-muted-foreground mt-1">Gerencie rotas de entrega de boletos e documentos.</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 max-w-[500px]">
                    <TabsTrigger value="minhas-rotas" className="gap-2"><Navigation className="w-4 h-4" /> Rotas Ativas</TabsTrigger>
                    <TabsTrigger value="nova-rota" className="gap-2"><Plus className="w-4 h-4" /> Criar Rota</TabsTrigger>
                    <TabsTrigger value="historico" className="gap-2"><Clock className="w-4 h-4" /> Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="historico" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Rotas Finalizadas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Entregador</TableHead>
                                        <TableHead>Paradas</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rotas.filter(r => r.status === 'Finalizada').map(rota => (
                                        <TableRow key={rota.id}>
                                            <TableCell>{format(new Date(rota.data_rota), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="font-medium">{rota.entregador_nome}</TableCell>
                                            <TableCell>{rota.paradas?.length || 0} paradas</TableCell>
                                            <TableCell><Badge variant="secondary">Finalizada</Badge></TableCell>
                                            <TableCell className="text-right flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => { setSelectedRoute(rota); setIsDetailsOpen(true); }}>
                                                    Ver Detalhes
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRoute(rota.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {rotas.filter(r => r.status === 'Finalizada').length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                Nenhuma rota finalizada encontrada.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="minhas-rotas" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {rotas.filter(r => r.status !== 'Finalizada').map(rota => (
                            <Card key={rota.id} className="overflow-hidden border-l-4 border-l-primary shadow-md hover:shadow-lg transition-shadow">
                                <CardHeader className="pb-3 bg-muted/30">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <User className="w-4 h-4 text-primary" /> {rota.entregador_nome}
                                            </CardTitle>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Calendar className="w-3 h-3" /> {format(new Date(rota.data_rota), "dd 'de' MMMM", { locale: ptBR })}
                                            </div>
                                        </div>
                                         <div className="flex items-center gap-2">
                                            <Badge variant={rota.status === 'Em Rota' ? 'default' : 'secondary'}>
                                                {rota.status}
                                            </Badge>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => {
                                                setSelectedRoute(rota);
                                                setEditData({ entregador_id: rota.entregador_id, data_rota: rota.data_rota });
                                                setIsEditOpen(true);
                                            }}>
                                                <MoreHorizontal className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteRoute(rota.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                            <ListTodo className="w-3 h-3" /> Paradas ({Array.isArray(rota.paradas) ? rota.paradas.length : 0})
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                            {Array.isArray(rota.paradas) && rota.paradas.map((p, idx) => (
                                                <div key={p.id} className={cn(
                                                    "flex items-center justify-between p-2 rounded-lg border text-sm transition-colors",
                                                    p.status === 'Entregue' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-background"
                                                )}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-bold bg-muted w-5 h-5 flex items-center justify-center rounded-full shrink-0">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="truncate font-medium">{p.cliente_nome}</span>
                                                    </div>
                                                    {p.status === 'Entregue' ? (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                    ) : p.status === 'Iniciada' ? (
                                                        <Clock className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <Button className="w-full gap-2 shadow-sm" onClick={() => { setSelectedRoute(rota); setIsDetailsOpen(true); }}>
                                        Gerenciar Rota <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                        
                        {rotas.filter(r => r.status !== 'Finalizada').length === 0 && !loading && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl">
                                <Navigation className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                                <h3 className="text-lg font-medium">Nenhuma rota ativa</h3>
                                <p className="text-muted-foreground">Crie uma nova rota para começar as entregas.</p>
                                <Button variant="outline" className="mt-4" onClick={() => setActiveTab("nova-rota")}>
                                    Criar Rota agora
                                </Button>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="nova-rota" className="mt-6">
                    <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-t-primary">
                        <CardHeader>
                            <CardTitle>Planejar Nova Rota</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Entregador Responsável</Label>
                                        <select 
                                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                            value={selectedDriverId}
                                            onChange={(e) => setSelectedDriverId(e.target.value)}
                                        >
                                            <option value="">Selecione...</option>
                                            {drivers.map(d => (
                                                <option key={d.id} value={d.id}>{d.nome}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Adicionar Clientes</Label>
                                        <div className="flex gap-2">
                                            <Input 
                                                placeholder="Nome do cliente..." 
                                                value={searchClient}
                                                onChange={(e) => setSearchClient(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSearchClients()}
                                            />
                                            <Button variant="secondary" onClick={handleSearchClients}><Search className="w-4 h-4" /></Button>
                                        </div>
                                    </div>

                                    <div className="border rounded-lg p-2 max-h-[300px] overflow-y-auto space-y-1 bg-muted/10">
                                        {clients.length > 0 ? clients.map(c => (
                                            <div key={c.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors border border-transparent hover:border-border">
                                                <div className="min-w-0">
                                                    <div className="font-medium text-sm truncate">{c.nome}</div>
                                                    <div className="text-[10px] text-muted-foreground truncate">{c.endereco}</div>
                                                </div>
                                                <Button size="sm" variant={selectedClients.find(sc => sc.id === c.id) ? "destructive" : "outline"} onClick={() => toggleClientSelection(c)}>
                                                    {selectedClients.find(sc => sc.id === c.id) ? <Trash2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                                </Button>
                                            </div>
                                        )) : (
                                            <div className="py-8 text-center text-xs text-muted-foreground">
                                                Busque clientes pelo nome para adicionar à rota.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <Label className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            Itinerário da Rota 
                                            <Badge variant="outline">{selectedClients.length} paradas</Badge>
                                        </div>
                                        {selectedClients.length >= 2 && (
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-8 gap-2 text-primary border-primary/20 hover:bg-primary/5"
                                                onClick={handleOptimizeRoute}
                                                disabled={isOptimizing}
                                            >
                                                {isOptimizing ? <Clock className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                Otimizar Rota
                                            </Button>
                                        )}
                                    </Label>
                                    <div className="border rounded-lg min-h-[400px] bg-muted/5 p-4 space-y-3 relative">
                                        {selectedClients.map((c, i) => (
                                            <div key={c.id} className="flex items-center gap-3 bg-background p-3 rounded-xl border shadow-sm group animate-in slide-in-from-right-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 border border-primary/20">
                                                    {i + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-sm truncate">{c.nome}</div>
                                                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                                        <MapPin className="w-2.5 h-2.5" /> {c.endereco_cidade} - {c.endereco_uf}
                                                    </div>
                                                </div>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => toggleClientSelection(c)}>
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        
                                        {selectedClients.length === 0 && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 opacity-40">
                                                <ListTodo className="w-12 h-12 mb-2" />
                                                <p className="text-sm font-medium">Nenhum cliente selecionado</p>
                                                <p className="text-[11px]">As paradas aparecerão aqui conforme você as adicionar.</p>
                                            </div>
                                        )}
                                    </div>
                                    <Button className="w-full py-6 text-lg font-bold shadow-lg" disabled={isCreating || selectedClients.length === 0} onClick={handleCreateRoute}>
                                        {isCreating ? "Criando..." : "Gerar Rota de Entrega"}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Modal de Gerenciamento de Rota */}
            <Modal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                title="Execução da Rota"
                className="max-w-4xl"
            >
                <div className="space-y-6 pt-4">
                    {Array.isArray(selectedRoute?.paradas) && selectedRoute.paradas.length >= 2 && (
                        <div className="space-y-4">
                            <Button 
                                variant="outline" 
                                className="w-full gap-2 border-primary/20 text-primary hover:bg-primary/5 h-12 font-bold"
                                onClick={handleOptimizeExistingRoute}
                                disabled={isOptimizing}
                            >
                                {isOptimizing ? <Clock className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Otimizar Ordem das Entregas (GPS)
                            </Button>

                            {isLoaded && (
                                <div className="h-[300px] w-full rounded-xl overflow-hidden border-2 border-primary/10 shadow-inner bg-muted">
                                    <GoogleMap
                                        mapContainerStyle={{ width: '100%', height: '100%' }}
                                        center={{ lat: -22.223, lng: -54.811 }} // Dourados coordinates
                                        zoom={13}
                                        options={{
                                            disableDefaultUI: true,
                                            zoomControl: true,
                                        }}
                                    >
                                        {directionsResponse && (
                                            <DirectionsRenderer directions={directionsResponse} />
                                        )}
                                    </GoogleMap>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                <ListTodo className="w-4 h-4" />
                                Lista de Paradas
                            </h3>
                            <div className="relative w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar cliente para adicionar..."
                                    className="pl-9 h-9 text-xs"
                                    value={searchTerm}
                                    onChange={(e) => handleSearchCustomers(e.target.value)}
                                />
                                {searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 w-full mt-1 bg-white border rounded-lg shadow-xl z-50 overflow-hidden max-h-[300px] overflow-y-auto">
                                        {searchResults.map(cliente => (
                                            <button
                                                key={cliente.id}
                                                className="w-full text-left p-3 hover:bg-primary/5 border-b last:border-0 transition-colors flex flex-col gap-0.5"
                                                onClick={() => {
                                                    handleAddStop(cliente.id)
                                                    setSearchTerm("")
                                                    setSearchResults([])
                                                }}
                                            >
                                                <span className="font-bold text-xs uppercase text-slate-800">{cliente.nome}</span>
                                                <span className="text-[10px] text-muted-foreground truncate">
                                                    {cliente.endereco_logradouro ? `${cliente.endereco_logradouro}, ${cliente.endereco_numero}` : "Sem endereço cadastrado"}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {isSearching && searchTerm.length >= 2 && (
                                    <div className="absolute right-3 top-2.5">
                                        <Clock className="w-4 h-4 text-muted-foreground animate-spin" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {Array.isArray(selectedRoute?.paradas) && selectedRoute.paradas.map((p, i) => (
                            <Card key={p.id} className={cn(
                                "relative overflow-hidden transition-all",
                                p.status === 'Entregue' ? "opacity-70 bg-muted/30 border-emerald-500/30" : "shadow-md hover:shadow-lg",
                                p.status === 'Iniciada' ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20" : ""
                            )}>
                                {p.status === 'Iniciada' && (
                                    <div className="absolute top-0 right-0 p-2">
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full animate-pulse">
                                            <Clock className="w-2.5 h-2.5" /> EM TRÂNSITO
                                        </div>
                                    </div>
                                )}
                                <CardContent className="p-4">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center text-xl md:text-lg font-bold shrink-0 mt-1">
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <h4 className="font-black text-xl md:text-base leading-tight text-slate-800 break-words uppercase">{p.cliente_nome}</h4>
                                                <div className="bg-primary/5 p-3 rounded-lg border border-primary/10 md:bg-transparent md:p-0 md:border-0">
                                                    <p className={cn(
                                                        "text-base md:text-xs font-bold md:font-medium flex items-start gap-1.5 leading-snug",
                                                        (!p.endereco_logradouro || p.endereco_logradouro.trim() === "") ? "text-red-500" : "text-slate-700 md:text-muted-foreground"
                                                    )}>
                                                        <MapPin className="w-4 h-4 md:w-3 md:h-3 shrink-0 mt-0.5" /> 
                                                        {(!p.endereco_logradouro || p.endereco_logradouro.trim() === "") ? 
                                                            "CADASTRO SEM ENDEREÇO" : 
                                                            `${p.endereco_logradouro}, ${p.endereco_numero || 'S/N'} - ${p.endereco_bairro}, ${p.endereco_cidade}/${p.endereco_uf}`
                                                        }
                                                    </p>
                                                </div>
                                                {p.horario_inicio && (
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        <Badge variant="outline" className="text-[10px] font-mono h-5 gap-1">
                                                            <Play className="w-2.5 h-2.5" /> {format(new Date(p.horario_inicio), 'HH:mm')}
                                                        </Badge>
                                                        {p.horario_chegada && (
                                                            <Badge variant="outline" className="text-[10px] font-mono h-5 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                                                <CheckCircle2 className="w-2.5 h-2.5" /> {format(new Date(p.horario_chegada), 'HH:mm')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 shrink-0 mt-2 md:mt-0">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-16 md:h-9 w-full md:w-9 text-slate-400 hover:text-red-500 hover:bg-red-50 border-2 md:border border-slate-100"
                                                onClick={() => handleRemoveStop(p.id)}
                                            >
                                                <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                                            </Button>

                                            <Button variant="outline" size="lg" className="flex-1 md:flex-none gap-2 h-16 md:h-9 px-6 md:px-3 text-base md:text-xs font-black md:font-bold border-2 md:border" onClick={() => openGoogleMaps(p)}>
                                                <Navigation className="w-5 h-5 md:w-3.5 md:h-3.5" /> GPS
                                            </Button>
                                            
                                            {p.status === 'Pendente' && (
                                                <Button size="lg" className="flex-1 md:flex-none gap-2 h-16 md:h-9 px-6 md:px-3 bg-amber-600 hover:bg-amber-700 text-white text-base md:text-xs font-black md:font-bold shadow-lg md:shadow-none" onClick={() => handleStartStop(p.id)}>
                                                    <Play className="w-5 h-5 md:w-3.5 md:h-3.5" /> Iniciar
                                                </Button>
                                            )}
                                            
                                            {p.status === 'Iniciada' && (
                                                <Button size="lg" className="flex-1 md:flex-none gap-2 h-16 md:h-9 px-6 md:px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-base md:text-xs font-black md:font-bold shadow-lg md:shadow-none" onClick={() => handleFinishStop(p.id)}>
                                                    <CheckCircle2 className="w-5 h-5 md:w-3.5 md:h-3.5" /> Cheguei
                                                </Button>
                                            )}

                                            {p.status === 'Entregue' && (
                                                <div className="flex items-center justify-center gap-2 text-emerald-600 font-black text-lg md:text-sm px-3 py-4 md:py-0">
                                                    <CheckCircle2 className="w-6 h-6 md:w-4 md:h-4" /> Finalizado
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 pt-6 border-t pb-2 md:pb-0">
                        <Button variant="ghost" className="h-12 md:h-9" onClick={() => setIsDetailsOpen(false)}>Fechar Janela</Button>
                        <Button 
                            variant="default" 
                            size="lg"
                            className="h-16 md:h-9 bg-primary hover:bg-primary/90 text-lg md:text-sm font-black md:font-bold shadow-xl md:shadow-none"
                            disabled={!Array.isArray(selectedRoute?.paradas) || selectedRoute.paradas.some(p => p.status !== 'Entregue')}
                            onClick={() => selectedRoute && handleFinalizeRoute(selectedRoute.id)}
                        >
                            Finalizar Rota Inteira
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Route Modal */}
            <Modal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                title="Editar Rota"
            >
                <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Entregador</Label>
                        <select 
                            className="w-full p-2 border rounded-md"
                            value={editData.entregador_id}
                            onChange={(e) => setEditData({ ...editData, entregador_id: e.target.value })}
                        >
                            {drivers.map(d => (
                                <option key={d.id} value={d.id}>{d.nome}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Data da Rota</Label>
                        <Input 
                            type="date"
                            value={editData.data_rota ? new Date(editData.data_rota).toISOString().split('T')[0] : ""}
                            onChange={(e) => setEditData({ ...editData, data_rota: e.target.value })}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                        <Button onClick={handleUpdateRoute}>Salvar Alterações</Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
