import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Megaphone, Save, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { configuracoesApi } from '@/lib/api'

export function SystemUpdateManager() {
    const [updates, setUpdates] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [newUpdate, setNewUpdate] = useState({ titulo: '', mensagem: '', versao: '' })

    const fetchUpdates = async () => {
        try {
            const data = await configuracoesApi.listarUpdates()
            setUpdates(data)
        } catch (err) {
            console.error(err)
        }
    }

    useEffect(() => {
        fetchUpdates()
    }, [])

    const handleCreateUpdate = async () => {
        if (!newUpdate.titulo.trim() || !newUpdate.mensagem.trim()) {
            toast.error("Preencha título e mensagem.")
            return
        }
        setLoading(true)
        try {
            await configuracoesApi.createUpdate(newUpdate)
            setNewUpdate({ titulo: '', mensagem: '', versao: '' })
            fetchUpdates()
            toast.success("Atualização publicada com sucesso!")
        } catch (err) {
            toast.error("Erro ao publicar atualização.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="border-rose-500/20 bg-rose-500/5">
            <CardHeader>
                <CardTitle className="text-rose-500 flex items-center gap-2">
                    <Megaphone className="w-5 h-5" /> 
                    Publicar Atualização do Sistema
                </CardTitle>
                <CardDescription>
                    Esta mensagem aparecerá para todos os atendentes assim que entrarem no sistema.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Título da Atualização</Label>
                        <Input 
                            placeholder="Ex: Novas funcionalidades no QR Code"
                            value={newUpdate.titulo}
                            onChange={e => setNewUpdate(prev => ({ ...prev, titulo: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Versão (Opcional)</Label>
                        <Input 
                            placeholder="Ex: v2.4.0"
                            value={newUpdate.versao}
                            onChange={e => setNewUpdate(prev => ({ ...prev, versao: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Mensagem Detalhada</Label>
                        <div className="flex gap-1">
                            {['🚀', '✨', '✅', '🆕', '🛠️', '⚠️', '📦', '📱'].map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => setNewUpdate(prev => ({ ...prev, mensagem: prev.mensagem + emoji }))}
                                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-rose-500/20 text-lg transition-colors"
                                    title={`Inserir ${emoji}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Textarea 
                        placeholder="Descreva as melhorias feitas..."
                        rows={6}
                        value={newUpdate.mensagem}
                        onChange={e => setNewUpdate(prev => ({ ...prev, mensagem: e.target.value }))}
                    />
                </div>
                <Button 
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-12" 
                    onClick={handleCreateUpdate}
                    disabled={loading}
                >
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? "Publicando..." : "Publicar para Todos os Atendentes"}
                </Button>

                <div className="pt-8 border-t border-rose-200 dark:border-rose-900/30">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                        Histórico de Atualizações
                        <Badge variant="secondary" className="ml-2">{updates.length}</Badge>
                    </h3>
                    <div className="space-y-4">
                        {updates.map((u: any) => (
                            <div key={u.id} className="p-5 rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-rose-100 dark:bg-rose-900/30 p-2 rounded-lg">
                                            <Megaphone className="w-4 h-4 text-rose-600" />
                                        </div>
                                        <div>
                                            <span className="font-bold text-foreground block">{u.titulo}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {u.versao && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{u.versao}</Badge>}
                                                <span className="text-[10px] text-muted-foreground font-medium uppercase">
                                                    {new Date(u.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-4">
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{u.mensagem}</p>
                                </div>
                            </div>
                        ))}
                        {updates.length === 0 && (
                            <div className="text-center py-12 border-2 border-dashed rounded-2xl border-muted">
                                <Megaphone className="w-8 h-8 text-muted mx-auto mb-3 opacity-20" />
                                <p className="text-muted-foreground text-sm">Nenhuma atualização registrada ainda.</p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
