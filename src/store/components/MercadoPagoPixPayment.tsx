import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface MercadoPagoPixPaymentProps {
    qrCodeBase64?: string | null
    copyPaste?: string | null
    expirationDate?: string | null
    total: number
}

/**
 * Exibe o QR/copia-e-cola do PIX gerado pelo Mercado Pago (já vem pronto da
 * API, ao contrário do PIX de chave própria em `ManualPixPayment`). A
 * confirmação é automática via webhook — sem upload de comprovante aqui.
 */
export function MercadoPagoPixPayment({ qrCodeBase64, copyPaste, expirationDate, total }: MercadoPagoPixPaymentProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        if (!copyPaste) return
        navigator.clipboard.writeText(copyPaste)
            .then(() => {
                setCopied(true)
                toast.success('PIX copiado!')
                setTimeout(() => setCopied(false), 2000)
            })
            .catch(() => toast.error('Não foi possível copiar.'))
    }

    const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total || 0)

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
                        {qrCodeBase64 ? (
                            <img
                                src={`data:image/png;base64,${qrCodeBase64}`}
                                alt="QR Code PIX"
                                className="rounded-lg border w-[260px] h-[260px] object-contain bg-white"
                            />
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
                        {copyPaste && (
                            <div>
                                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">PIX copia e cola</p>
                                <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-[11.5px] font-mono break-all max-h-24 overflow-y-auto text-slate-950 font-semibold shadow-inner">
                                    {copyPaste}
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
                        )}
                        {expirationDate && (
                            <p className="text-xs text-slate-500">
                                Expira em {new Date(expirationDate).toLocaleString('pt-BR')}
                            </p>
                        )}
                    </div>
                </div>

                <p className="text-xs text-slate-500 text-center pt-2 border-t">
                    A confirmação é automática — assim que o pagamento cair, esta página atualiza sozinha.
                </p>
            </CardContent>
        </Card>
    )
}
