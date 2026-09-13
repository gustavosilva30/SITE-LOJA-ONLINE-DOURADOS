import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { QrCode, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'

interface PixConfig {
    chave_pix?: string | null
    tipo_chave?: string | null
    nome_beneficiario?: string | null
    cidade_beneficiario?: string | null
    instrucoes?: string | null
    ativo?: boolean
}

export function StorePixConfigCard() {
    const [config, setConfig] = useState<PixConfig>({ ativo: false })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                const data = await api.get('/api/admin/store-orders/config/pix')
                setConfig(data || { ativo: false })
            } catch (e: any) {
                if (!String(e?.message || '').includes('404')) {
                    console.error(e)
                }
            } finally { setLoading(false) }
        })()
    }, [])

    const salvar = async () => {
        if (config.ativo && !config.chave_pix?.trim()) {
            toast.error('Informe a chave PIX antes de ativar.')
            return
        }
        setSaving(true)
        try {
            const data = await api.put('/api/admin/store-orders/config/pix', {
                chave_pix: config.chave_pix || null,
                tipo_chave: config.tipo_chave || null,
                nome_beneficiario: config.nome_beneficiario || null,
                cidade_beneficiario: config.cidade_beneficiario || null,
                instrucoes: config.instrucoes || null,
                ativo: !!config.ativo,
            })
            setConfig(data)
            toast.success('Configuração salva')
        } catch (e: any) {
            toast.error(e?.message || 'Erro ao salvar')
        } finally { setSaving(false) }
    }

    if (loading) {
        return (
            <Card><CardContent className="p-6 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando...
            </CardContent></Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <QrCode className="w-5 h-5" /> PIX da Loja Online
                    {config.ativo
                        ? <Badge className="bg-emerald-100 text-emerald-700">Ativo</Badge>
                        : <Badge className="bg-slate-100 text-slate-600">Desativado</Badge>}
                </CardTitle>
                <CardDescription>
                    Chave PIX usada para gerar o QR Code "copia e cola" exibido para o cliente após o checkout.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                        <Label>Chave PIX</Label>
                        <Input
                            value={config.chave_pix || ''}
                            onChange={e => setConfig({ ...config, chave_pix: e.target.value })}
                            placeholder="CPF, CNPJ, email, telefone ou aleatória"
                        />
                    </div>
                    <div>
                        <Label>Tipo da chave</Label>
                        <Select
                            value={config.tipo_chave || ''}
                            onChange={e => setConfig({ ...config, tipo_chave: e.target.value })}
                        >
                            <option value="">—</option>
                            <option value="cpf">CPF</option>
                            <option value="cnpj">CNPJ</option>
                            <option value="email">E-mail</option>
                            <option value="telefone">Telefone</option>
                            <option value="aleatoria">Aleatória</option>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <Label>Nome do beneficiário</Label>
                        <Input
                            value={config.nome_beneficiario || ''}
                            onChange={e => setConfig({ ...config, nome_beneficiario: e.target.value })}
                            placeholder="Ex: Dourados Auto Peças"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Aparece no app do banco do cliente. Máx 25 chars.</p>
                    </div>
                    <div>
                        <Label>Cidade do beneficiário</Label>
                        <Input
                            value={config.cidade_beneficiario || ''}
                            onChange={e => setConfig({ ...config, cidade_beneficiario: e.target.value })}
                            placeholder="Ex: Dourados"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Máx 15 chars.</p>
                    </div>
                </div>

                <div>
                    <Label>Instruções para o cliente (opcional)</Label>
                    <textarea
                        className="w-full border rounded p-2 text-sm min-h-[60px]"
                        value={config.instrucoes || ''}
                        onChange={e => setConfig({ ...config, instrucoes: e.target.value })}
                        placeholder="Ex: Após pagar, envie o comprovante para confirmar o pedido."
                    />
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={!!config.ativo}
                            onChange={e => setConfig({ ...config, ativo: e.target.checked })}
                        />
                        <span className="font-medium">Ativar pagamento via PIX na loja</span>
                    </label>
                    <Button onClick={salvar} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
