import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { 
    Cake, 
    ShoppingBag, 
    Save, 
    RefreshCw, 
    History, 
    Settings, 
    Variable, 
    CheckCircle2, 
    XCircle, 
    Clock,
    AlertCircle,
    Send
} from "lucide-react"
import { toast } from "sonner"
import { automacoesApi, whatsappApi } from "@/lib/api"
import { fmt } from "@/lib/format"
import { Select } from "@/components/ui/select"

interface AutomationConfig {
    id: string
    tipo: 'Aniversário' | 'Pós-Venda' | 'Boletos' | 'cobranca_interna'
    ativo: boolean
    template_texto: string
    horario_disparo: string | null
    delay_minutos: number | null
    intervalo_envios_segundos: number | null
    telefone_destino?: string
    instancia_id?: string
}

interface AutomationLog {
    id: string
    tipo: string
    cliente_id: string
    venda_id: string | null
    telefone: string
    status: string
    mensagem_erro: string | null
    created_at: string
    cliente_nome?: string
    venda_numero?: string
}

export function WhatsAppAutomacoes() {
    const [configs, setConfigs] = useState<AutomationConfig[]>([])
    const [logs, setLogs] = useState<AutomationLog[]>([])
    const [instances, setInstances] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState("config")

    const fetchConfigs = useCallback(async () => {
        try {
            const res = await automacoesApi.getConfigs()
            const mapped = (res || []).map((c: any) => ({
                ...c,
                template_texto: c.template_texto || c.template || "",
                delay_minutos: c.delay_minutos || (c.delay_segundos ? Math.round(c.delay_segundos / 60) : 0),
                horario_disparo: c.horario_disparo || c.horario_envio || "",
                intervalo_envios_segundos: c.intervalo_envios_segundos || 60
            }))
            setConfigs(mapped)
        } catch (e) {
            console.error(e)
            toast.error("Erro ao carregar configurações")
        }
    }, [])

    const fetchLogs = useCallback(async () => {
        try {
            const res = await automacoesApi.getLogs()
            setLogs(res || [])
        } catch (e) {
            console.error(e)
            toast.error("Erro ao carregar logs")
        }
    }, [])

    const fetchInstances = useCallback(async () => {
        try {
            const res = await whatsappApi.listarInstancias()
            setInstances(res || [])
        } catch (e) {
            console.error(e)
        }
    }, [])

    useEffect(() => {
        setLoading(true)
        Promise.all([fetchConfigs(), fetchLogs(), fetchInstances()]).finally(() => setLoading(false))
    }, [fetchConfigs, fetchLogs, fetchInstances])

    const handleUpdateConfig = async (tipo: string, data: Partial<AutomationConfig>) => {
        const config = configs.find(c => c.tipo === tipo)
        if (!config) return

        const payload = {
            ativo: data.ativo !== undefined ? data.ativo : config.ativo,
            template: data.template_texto !== undefined ? data.template_texto : (config.template_texto || (config as any).template || ""),
            horario_envio: data.horario_disparo !== undefined ? data.horario_disparo : (config.horario_disparo || (config as any).horario_envio || null),
            instancia_id: data.instancia_id !== undefined ? (data.instancia_id === "default" ? null : data.instancia_id) : (config.instancia_id || null),
            delay_segundos: data.delay_minutos !== undefined ? data.delay_minutos * 60 : ((config.delay_minutos || 0) * 60),
            telefone_destino: data.telefone_destino !== undefined ? data.telefone_destino : (config.telefone_destino || null),
            intervalo_envios_segundos: data.intervalo_envios_segundos !== undefined ? data.intervalo_envios_segundos : (config.intervalo_envios_segundos || 60)
        }

        setSaving(true)
        try {
            await automacoesApi.updateConfig(tipo, payload)
            toast.success(`${tipo} atualizado com sucesso`)
            fetchConfigs()
        } catch (e) {
            console.error(e)
            toast.error(`Erro ao atualizar ${tipo}`)
        } finally {
            setSaving(false)
        }
    }

    const configAniversario = configs.find(c => c.tipo === 'Aniversário' || c.tipo.toLowerCase() === 'aniversario')
    const configPosVenda = configs.find(c => c.tipo === 'Pós-Venda' || c.tipo.toLowerCase() === 'pos_venda')
    const configBoletos = configs.find(c => c.tipo === 'Boletos' || c.tipo.toLowerCase() === 'boletos')
    const configCobranca = configs.find(c => c.tipo === 'cobranca_interna')

    const variablesAniversario = ["{{nome}}", "{{empresa}}"]
    const variablesPosVenda = ["{{nome}}", "{{numero_pedido}}", "{{total_venda}}", "{{empresa}}"]
    const variablesBoletos = ["{{nome}}", "{{empresa}}", "{{valor_total}}", "{{parcelas}}"]
    const variablesCobranca = ["{{nome}}", "{{valor_parcela}}", "{{data_vencimento}}", "{{numero_parcela}}"]

    const insertVariable = (tipo: string, variable: string) => {
        setConfigs(prev => prev.map(c => {
            if (c.tipo === tipo) {
                return { ...c, template_texto: c.template_texto + " " + variable }
            }
            return c
        }))
    }

    return (
        <div className="container mx-auto py-6 space-y-6 max-w-6xl">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Automações de WhatsApp</h1>
                <p className="text-muted-foreground">
                    Configure mensagens automáticas de relacionamento e pós-venda para seus clientes.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                    <TabsTrigger value="config" className="gap-2">
                        <Settings className="w-4 h-4" /> Configurações
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="gap-2">
                        <History className="w-4 h-4" /> Histórico de Disparos
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="config" className="space-y-6 mt-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Aniversário */}
                        <Card className="border-t-4 border-t-pink-500">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-pink-100 rounded-lg text-pink-600">
                                            <Cake className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Aniversário</CardTitle>
                                            <CardDescription>Enviado diariamente às 09:00</CardDescription>
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={configAniversario?.ativo} 
                                        onCheckedChange={(checked) => handleUpdateConfig(configAniversario?.tipo || 'aniversario', { ativo: checked })}
                                        disabled={saving}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Horário Fixo de Envio</Label>
                                        <Input 
                                            type="time" 
                                            value={configAniversario?.horario_disparo || ''}
                                            onChange={(e) => setConfigs(prev => prev.map(c => (c.tipo === 'Aniversário' || c.tipo.toLowerCase() === 'aniversario') ? { ...c, horario_disparo: e.target.value } : c))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Intervalo entre Envios (segundos)</Label>
                                        <Input 
                                            type="number" 
                                            value={configAniversario?.intervalo_envios_segundos || 60}
                                            onChange={(e) => setConfigs(prev => prev.map(c => (c.tipo === 'Aniversário' || c.tipo.toLowerCase() === 'aniversario') ? { ...c, intervalo_envios_segundos: parseInt(e.target.value) || 60 } : c))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Template da Mensagem</Label>
                                    <Textarea 
                                        placeholder="Ex: Olá {{nome}}, parabéns pelo seu dia!" 
                                        className="min-h-[120px] resize-none"
                                        value={configAniversario?.template_texto || ''}
                                        onChange={(e) => setConfigs(prev => prev.map(c => (c.tipo === 'Aniversário' || c.tipo.toLowerCase() === 'aniversario') ? { ...c, template_texto: e.target.value } : c))}
                                    />
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Variable className="w-3 h-3" /> Variáveis:</span>
                                    {variablesAniversario.map(v => (
                                        <Badge 
                                            key={v} 
                                            variant="secondary" 
                                            className="cursor-pointer hover:bg-secondary/80"
                                            onClick={() => insertVariable(configAniversario?.tipo || 'aniversario', v)}
                                        >
                                            {v}
                                        </Badge>
                                    ))}
                                </div>

                                <Button 
                                    className="w-full gap-2" 
                                    onClick={() => handleUpdateConfig(configAniversario?.tipo || 'aniversario', { template_texto: configAniversario?.template_texto })}
                                    disabled={saving}
                                >
                                    <Save className="w-4 h-4" /> Salvar Template
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Pós-Venda */}
                        <Card className="border-t-4 border-t-blue-500">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                            <ShoppingBag className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Pós-Venda</CardTitle>
                                            <CardDescription>Enviado após finalizar uma venda</CardDescription>
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={configPosVenda?.ativo} 
                                        onCheckedChange={(checked) => handleUpdateConfig(configPosVenda?.tipo || 'pos_venda', { ativo: checked })}
                                        disabled={saving}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Delay (minutos)</Label>
                                        <Input 
                                            type="number" 
                                            value={configPosVenda?.delay_minutos || 0}
                                            onChange={(e) => setConfigs(prev => prev.map(c => (c.tipo === 'Pós-Venda' || c.tipo.toLowerCase() === 'pos_venda') ? { ...c, delay_minutos: parseInt(e.target.value) } : c))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Intervalo entre Envios (segundos)</Label>
                                        <Input 
                                            type="number" 
                                            value={configPosVenda?.intervalo_envios_segundos || 60}
                                            onChange={(e) => setConfigs(prev => prev.map(c => (c.tipo === 'Pós-Venda' || c.tipo.toLowerCase() === 'pos_venda') ? { ...c, intervalo_envios_segundos: parseInt(e.target.value) || 60 } : c))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Template da Mensagem</Label>
                                    <Textarea 
                                        placeholder="Ex: Olá {{nome}}, obrigado pela compra #{{numero_pedido}}!" 
                                        className="min-h-[120px] resize-none"
                                        value={configPosVenda?.template_texto || ''}
                                        onChange={(e) => setConfigs(prev => prev.map(c => (c.tipo === 'Pós-Venda' || c.tipo.toLowerCase() === 'pos_venda') ? { ...c, template_texto: e.target.value } : c))}
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Variable className="w-3 h-3" /> Variáveis:</span>
                                    {variablesPosVenda.map(v => (
                                        <Badge 
                                            key={v} 
                                            variant="secondary" 
                                            className="cursor-pointer hover:bg-secondary/80"
                                            onClick={() => insertVariable(configPosVenda?.tipo || 'pos_venda', v)}
                                        >
                                            {v}
                                        </Badge>
                                    ))}
                                </div>

                                <Button 
                                    className="w-full gap-2" 
                                    onClick={() => handleUpdateConfig(configPosVenda?.tipo || 'pos_venda', { 
                                        template_texto: configPosVenda?.template_texto,
                                        delay_minutos: configPosVenda?.delay_minutos
                                    })}
                                    disabled={saving}
                                >
                                    <Save className="w-4 h-4" /> Salvar Template
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Boletos */}
                        <Card className="border-t-4 border-t-green-500">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-green-100 rounded-lg text-green-600">
                                            <Send className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Boletos</CardTitle>
                                            <CardDescription>Enviado ao gerar novos boletos</CardDescription>
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={configBoletos?.ativo} 
                                        onCheckedChange={(checked) => handleUpdateConfig(configBoletos?.tipo || 'boletos', { ativo: checked })}
                                        disabled={saving}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Instância de Disparo</Label>
                                        <Select 
                                            value={configBoletos?.instancia_id || "default"} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setConfigs(prev => prev.map(c => c.tipo.toLowerCase() === 'boletos' ? { ...c, instancia_id: val === "default" ? undefined : val } : c))
                                            }}
                                            className="h-10"
                                        >
                                            <option value="default">Automático (Principal da Loja)</option>
                                            {instances.map(inst => (
                                                <option key={inst.id} value={inst.id}>{inst.nome} ({inst.instance_name})</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Horário Fixo de Envio</Label>
                                        <Input 
                                            type="time" 
                                            value={configBoletos?.horario_disparo || ''}
                                            onChange={(e) => setConfigs(prev => prev.map(c => c.tipo.toLowerCase() === 'boletos' ? { ...c, horario_disparo: e.target.value } : c))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Intervalo (segundos)</Label>
                                        <Input 
                                            type="number" 
                                            value={configBoletos?.intervalo_envios_segundos || 60}
                                            onChange={(e) => setConfigs(prev => prev.map(c => c.tipo.toLowerCase() === 'boletos' ? { ...c, intervalo_envios_segundos: parseInt(e.target.value) || 60 } : c))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Template da Mensagem</Label>
                                    <Textarea 
                                        placeholder="Ex: Olá {{nome}}, seu boleto no valor de {{valor_total}} foi emitido!" 
                                        className="min-h-[120px] resize-none"
                                        value={configBoletos?.template_texto || ''}
                                        onChange={(e) => setConfigs(prev => prev.map(c => c.tipo.toLowerCase() === 'boletos' ? { ...c, template_texto: e.target.value } : c))}
                                    />
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Variable className="w-3 h-3" /> Variáveis:</span>
                                    {variablesBoletos.map(v => (
                                        <Badge 
                                            key={v} 
                                            variant="secondary" 
                                            className="cursor-pointer hover:bg-secondary/80"
                                            onClick={() => insertVariable(configBoletos?.tipo || 'boletos', v)}
                                        >
                                            {v}
                                        </Badge>
                                    ))}
                                </div>

                                <Button 
                                    className="w-full gap-2" 
                                    onClick={() => handleUpdateConfig(configBoletos?.tipo || 'boletos', { 
                                        template_texto: configBoletos?.template_texto,
                                        instancia_id: configBoletos?.instancia_id
                                    })}
                                    disabled={saving}
                                >
                                    <Save className="w-4 h-4" /> Salvar Template
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Aviso Inadimplência Interno */}
                        <Card className="border-t-4 border-t-red-500">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-red-100 rounded-lg text-red-600">
                                            <AlertCircle className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Aviso de Inadimplência</CardTitle>
                                            <CardDescription>Notificação interna de boletos vencidos ontem</CardDescription>
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={configCobranca?.ativo} 
                                        onCheckedChange={(checked) => handleUpdateConfig('cobranca_interna', { ativo: checked })}
                                        disabled={saving}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label>Telefone de Destino</Label>
                                        <Input 
                                            placeholder="Ex: 5511999999999" 
                                            value={configCobranca?.telefone_destino || ''}
                                            onChange={(e) => setConfigs(prev => prev.map(c => c.tipo === 'cobranca_interna' ? { ...c, telefone_destino: e.target.value } : c))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Instância</Label>
                                        <Select 
                                            value={configCobranca?.instancia_id || "default"} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setConfigs(prev => prev.map(c => c.tipo === 'cobranca_interna' ? { ...c, instancia_id: val === "default" ? undefined : val } : c))
                                            }}
                                            className="h-10"
                                        >
                                            <option value="default">Automático</option>
                                            {instances.map(inst => (
                                                <option key={inst.id} value={inst.id}>{inst.nome} ({inst.instance_name})</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Horário Fixo</Label>
                                        <Input 
                                            type="time" 
                                            value={configCobranca?.horario_disparo || ''}
                                            onChange={(e) => setConfigs(prev => prev.map(c => c.tipo === 'cobranca_interna' ? { ...c, horario_disparo: e.target.value } : c))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Intervalo (segundos)</Label>
                                        <Input 
                                            type="number" 
                                            value={configCobranca?.intervalo_envios_segundos || 60}
                                            onChange={(e) => setConfigs(prev => prev.map(c => c.tipo === 'cobranca_interna' ? { ...c, intervalo_envios_segundos: parseInt(e.target.value) || 60 } : c))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Template da Mensagem</Label>
                                    <Textarea 
                                        placeholder="Ex: O cliente {{nome}} possui parcela vencida!" 
                                        className="min-h-[120px] resize-none"
                                        value={configCobranca?.template_texto || ''}
                                        onChange={(e) => setConfigs(prev => prev.map(c => c.tipo === 'cobranca_interna' ? { ...c, template_texto: e.target.value } : c))}
                                    />
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Variable className="w-3 h-3" /> Variáveis:</span>
                                    {variablesCobranca.map(v => (
                                        <Badge 
                                            key={v} 
                                            variant="secondary" 
                                            className="cursor-pointer hover:bg-secondary/80"
                                            onClick={() => insertVariable('cobranca_interna', v)}
                                        >
                                            {v}
                                        </Badge>
                                    ))}
                                </div>

                                <Button 
                                    className="w-full gap-2" 
                                    onClick={() => handleUpdateConfig('cobranca_interna', { 
                                        template_texto: configCobranca?.template_texto,
                                        telefone_destino: configCobranca?.telefone_destino,
                                        instancia_id: configCobranca?.instancia_id
                                    })}
                                    disabled={saving}
                                >
                                    <Save className="w-4 h-4" /> Salvar Configuração
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Dicas e Melhores Práticas</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-3 gap-6">
                            <div className="flex gap-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-semibold text-sm">Humanize as mensagens</p>
                                    <p className="text-xs text-muted-foreground">Evite textos muito formais. Use emojis moderadamente para parecer uma conversa real.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-semibold text-sm">Cuidado com Bloqueios</p>
                                    <p className="text-xs text-muted-foreground">O sistema envia com intervalos randômicos, mas templates idênticos para muitos clientes podem ser spam.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Clock className="w-5 h-5 text-blue-500 shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-semibold text-sm">Horários Apropriados</p>
                                    <p className="text-xs text-muted-foreground">Mensagens de aniversário são agendadas para as 09:00 para não incomodar muito cedo.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="logs" className="mt-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Histórico de Disparos</CardTitle>
                                <CardDescription>Últimas 100 mensagens enviadas automaticamente.</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data/Hora</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Telefone</TableHead>
                                        <TableHead>Referência</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                                Nenhum disparo registrado ainda.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="text-xs">
                                                    {new Date(log.created_at).toLocaleString('pt-BR')}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={log.tipo === 'Aniversário' ? 'text-pink-500' : 'text-blue-500'}>
                                                        {log.tipo}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {log.cliente_nome || 'Desconhecido'}
                                                </TableCell>
                                                <TableCell className="text-xs font-mono">
                                                    {log.telefone}
                                                </TableCell>
                                                <TableCell>
                                                    {log.venda_numero ? (
                                                        <span className="text-xs">Pedido #{log.venda_numero}</span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {log.status === 'Enviado' ? (
                                                        <Badge className="bg-emerald-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Enviado</Badge>
                                                    ) : log.status === 'Erro' ? (
                                                        <Badge variant="destructive" className="gap-1" title={log.mensagem_erro || ''}>
                                                            <XCircle className="w-3 h-3" /> Erro
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> {log.status}</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
