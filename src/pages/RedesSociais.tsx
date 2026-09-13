import { useState, useEffect } from "react"
import { 
    Instagram, 
    Facebook, 
    MessageSquare, 
    Search, 
    Filter, 
    Clock, 
    User,
    MoreHorizontal,
    Reply,
    CheckCircle2,
    Mail
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { supabase } from "@/lib/supabase" // Assumindo que usamos o cliente do banco direto ou via API

interface Interaction {
    id: string
    platform: 'instagram' | 'facebook' | 'whatsapp'
    sender_name: string
    sender_id: string
    message_text: string
    media_url?: string
    created_at: string
    is_read: boolean
}

export function RedesSociais() {
    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)

    useEffect(() => {
        fetchInteractions()
    }, [])

    async function fetchInteractions() {
        setLoading(true)
        try {
            const response = await fetch("/api/social/interactions")
            if (response.ok) {
                const data = await response.json()
                setInteractions(data)
            }
        } catch (error) {
            console.error("Erro ao buscar interações:", error)
        } finally {
            setLoading(false)
        }
    }

    const filteredInteractions = interactions.filter(i => {
        const matchesSearch = i.sender_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            i.message_text.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesPlatform = !selectedPlatform || i.platform === selectedPlatform
        return matchesSearch && matchesPlatform
    })

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                        Inbox Social
                    </h1>
                    <p className="text-muted-foreground">
                        Gerencie suas mensagens do Instagram e outras redes em um só lugar.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchInteractions}>
                        Atualizar
                    </Button>
                    <Badge variant="secondary" className="px-3 py-1">
                        {interactions.filter(i => !i.is_read).length} Novas
                    </Badge>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Filtros e Busca */}
                <Card className="lg:col-span-1 border-white/5 bg-black/20 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase text-muted-foreground">Plataforma</Label>
                            <div className="grid grid-cols-1 gap-2">
                                <Button 
                                    variant={selectedPlatform === null ? "secondary" : "ghost"} 
                                    size="sm" 
                                    className="justify-start gap-2"
                                    onClick={() => setSelectedPlatform(null)}
                                >
                                    <MessageSquare className="h-4 w-4" /> Todos
                                </Button>
                                <Button 
                                    variant={selectedPlatform === "instagram" ? "secondary" : "ghost"} 
                                    size="sm" 
                                    className="justify-start gap-2"
                                    onClick={() => setSelectedPlatform("instagram")}
                                >
                                    <Instagram className="h-4 w-4 text-pink-500" /> Instagram
                                </Button>
                                <Button 
                                    variant={selectedPlatform === "facebook" ? "secondary" : "ghost"} 
                                    size="sm" 
                                    className="justify-start gap-2"
                                    onClick={() => setSelectedPlatform("facebook")}
                                >
                                    <Facebook className="h-4 w-4 text-blue-500" /> Facebook
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Lista de Mensagens */}
                <div className="lg:col-span-3 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    ) : filteredInteractions.length === 0 ? (
                        <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center">
                            <Mail className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                            <h3 className="font-semibold">Nenhuma mensagem encontrada</h3>
                            <p className="text-sm text-muted-foreground">Tente ajustar seus filtros ou busca.</p>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            {filteredInteractions.map((msg) => (
                                <Card 
                                    key={msg.id} 
                                    className={`group transition-all hover:border-primary/50 bg-white/[0.02] border-white/5 ${!msg.is_read ? 'border-l-4 border-l-purple-500' : ''}`}
                                >
                                    <CardContent className="p-0">
                                        <div className="p-4 flex items-start gap-4">
                                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-white/10">
                                                {msg.platform === 'instagram' ? (
                                                    <Instagram className="h-5 w-5 text-pink-500" />
                                                ) : (
                                                    <User className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold">{msg.sender_name}</span>
                                                        <span className="text-xs text-muted-foreground">{msg.sender_id}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Clock className="h-3 w-3" />
                                                        {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-slate-300 line-clamp-2">
                                                    {msg.message_text}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="h-[1px] bg-white/5" />
                                        <div className="p-2 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="sm" className="h-8 gap-1">
                                                <Reply className="h-4 w-4" /> Responder
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 gap-1"
                                                onClick={async () => {
                                                    await fetch(`/api/social/interactions/${msg.id}/read`, { method: 'POST' })
                                                    fetchInteractions()
                                                }}
                                            >
                                                <CheckCircle2 className="h-4 w-4" /> Marcar Lida
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function Label({ children, className }: { children: React.ReactNode, className?: string }) {
    return <span className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</span>
}
