import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, CheckCircle2, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiBaseUrl } from '@/lib/apiBase'
import QRCode from 'qrcode'

interface ManualPixPaymentProps {
    orderId: string
    token: string
    pixPayload: string
    total: number
    beneficiarioNome?: string | null
    instrucoes?: string | null
    comprovanteEnviado?: boolean
    onComprovanteUploaded?: (url: string) => void
}

export function ManualPixPayment({
    orderId,
    token,
    pixPayload,
    total,
    beneficiarioNome,
    instrucoes,
    comprovanteEnviado: comprovanteEnviadoProp,
    onComprovanteUploaded,
}: ManualPixPaymentProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string>('')
    const [copied, setCopied] = useState(false)
    const [comprovanteEnviado, setComprovanteEnviado] = useState(!!comprovanteEnviadoProp)
    const [uploading, setUploading] = useState(false)
    const [observacao, setObservacao] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!pixPayload) return
        QRCode.toDataURL(pixPayload, { width: 260, margin: 1, errorCorrectionLevel: 'M' })
            .then(setQrDataUrl)
            .catch(err => console.error('QR error:', err))
    }, [pixPayload])

    const handleCopy = () => {
        if (!pixPayload) return
        navigator.clipboard.writeText(pixPayload)
            .then(() => {
                setCopied(true)
                toast.success('PIX copiado!')
                setTimeout(() => setCopied(false), 2000)
            })
            .catch(() => toast.error('Não foi possível copiar.'))
    }

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Arquivo muito grande (máx 5MB)')
            return
        }
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        if (!allowed.includes(file.type)) {
            toast.error('Tipo de arquivo não suportado. Use JPG, PNG ou PDF.')
            return
        }
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('arquivo', file)
            formData.append('token', token)
            if (observacao) formData.append('observacao', observacao)
            const res = await fetch(`${getApiBaseUrl()}/api/store/checkout/orders/${orderId}/comprovante`, {
                method: 'POST',
                body: formData,
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.detail || 'Falha no envio')
            setComprovanteEnviado(true)
            toast.success('Comprovante enviado! Aguarde a confirmação.')
            onComprovanteUploaded?.(data.comprovante_url)
        } catch (err: any) {
            toast.error(err?.message || 'Erro ao enviar comprovante')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total || 0)

    if (comprovanteEnviado) {
        return (
            <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="pt-6 text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                    </div>
                    <div>
                        <p className="font-bold text-emerald-800">Comprovante enviado!</p>
                        <p className="text-sm text-slate-600 mt-1">
                            Vamos conferir e liberar seu pedido em breve.
                            Você receberá uma notificação assim que o pagamento for confirmado.
                        </p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>Pagamento via PIX</span>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">Aguardando pagamento</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-4 items-start">
                    <div className="flex flex-col items-center">
                        {qrDataUrl ? (
                            <img src={qrDataUrl} alt="QR Code PIX" className="rounded-lg border" />
                        ) : (
                            <div className="w-[260px] h-[260px] bg-slate-100 rounded-lg flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                        )}
                        <p className="text-xs text-slate-500 mt-2">Escaneie com seu banco</p>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Valor</p>
                            <p className="text-2xl font-black text-slate-900">{totalFmt}</p>
                        </div>
                        {beneficiarioNome && (
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Beneficiário</p>
                                <p className="text-sm font-bold text-slate-800">{beneficiarioNome}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">PIX copia e cola</p>
                            <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-[11.5px] font-mono break-all max-h-24 overflow-y-auto text-slate-950 font-semibold shadow-inner">
                                {pixPayload}
                            </div>
                            <Button
                                onClick={handleCopy}
                                variant="secondary"
                                size="sm"
                                className="mt-2 gap-2 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-300 shadow-sm"
                            >
                                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </Button>
                        </div>
                    </div>
                </div>

                {instrucoes && (
                    <div className="text-sm text-slate-600 p-3 bg-blue-50 border border-blue-100 rounded">
                        {instrucoes}
                    </div>
                )}

                <div className="border-t pt-4 space-y-2">
                    <p className="font-bold text-sm text-slate-800">Já pagou? Envie o comprovante:</p>
                    <textarea
                        className="w-full border rounded p-2 text-sm min-h-[60px]"
                        placeholder="Observação opcional (ex: pago via Pix do Itaú, transação 123...)"
                        value={observacao}
                        onChange={e => setObservacao(e.target.value)}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={handleFile}
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? 'Enviando...' : 'Enviar comprovante (JPG/PNG/PDF)'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
