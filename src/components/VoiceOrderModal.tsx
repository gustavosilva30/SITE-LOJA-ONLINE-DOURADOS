import { useEffect, useState } from 'react'
import { Mic, MicOff, RotateCcw, Check, AlertCircle, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder'
import { parseVoiceOrder, type ParsedVoiceOrder } from '@/lib/voiceParser'

interface VoiceOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (parsed: ParsedVoiceOrder, audioBlob: Blob | null) => void
}

export function VoiceOrderModal({ isOpen, onClose, onConfirm }: VoiceOrderModalProps) {
  const { state, transcript, interimTranscript, errorMsg, isSupported, start, stop, reset, audioBlob } =
    useVoiceRecorder()

  const [parsed, setParsed] = useState<ParsedVoiceOrder | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Parsear assim que parar de gravar e houver texto
  useEffect(() => {
    if (state === 'idle' && transcript) {
      const result = parseVoiceOrder(transcript)
      setParsed(result)
      setShowPreview(true)
    }
  }, [state, transcript])

  const handleClose = () => {
    reset()
    setParsed(null)
    setShowPreview(false)
    onClose()
  }

  const handleConfirm = () => {
    if (!parsed) return
    onConfirm(parsed, audioBlob)
    handleClose()
  }

  const handleRestart = () => {
    reset()
    setParsed(null)
    setShowPreview(false)
  }

  const fullText = transcript + (interimTranscript ? ' ' + interimTranscript : '')

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Pedido por voz"
      className="max-w-lg w-full rounded-2xl"
      contentClassName="p-6 space-y-5"
    >
      {!isSupported && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Reconhecimento de voz não suportado neste navegador. Use <strong>Google Chrome</strong> ou{' '}
            <strong>Microsoft Edge</strong>.
          </span>
        </div>
      )}

      {isSupported && (
        <>
          {/* Área de transcrição */}
          <div
            className={cn(
              'min-h-[120px] rounded-xl border-2 p-4 text-sm transition-colors',
              state === 'recording'
                ? 'border-red-400 bg-red-50'
                : showPreview
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-border bg-muted/30'
            )}
          >
            {!fullText && state !== 'recording' && (
              <p className="text-muted-foreground italic">
                Clique em <strong>Gravar</strong> e dite o pedido. Exemplo:{' '}
                <em>"parachoque dianteiro gol g5, 2 peças, farol esquerdo corolla 1 par"</em>
              </p>
            )}
            {fullText && (
              <p className="leading-relaxed">
                <span className="text-foreground">{transcript}</span>
                {interimTranscript && (
                  <span className="text-muted-foreground italic"> {interimTranscript}</span>
                )}
              </p>
            )}
            {state === 'recording' && !fullText && (
              <div className="flex items-center gap-2 text-red-600">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm">Ouvindo...</span>
              </div>
            )}
          </div>

          {/* Botões de controle */}
          <div className="flex gap-3 justify-center">
            {state === 'idle' && !showPreview && (
              <Button onClick={start} className="gap-2 h-12 px-8 rounded-xl font-bold text-base">
                <Mic className="h-5 w-5" />
                Gravar
              </Button>
            )}
            {state === 'recording' && (
              <Button
                onClick={stop}
                variant="destructive"
                className="gap-2 h-12 px-8 rounded-xl font-bold text-base animate-pulse"
              >
                <MicOff className="h-5 w-5" />
                Parar
              </Button>
            )}
            {state === 'idle' && showPreview && (
              <Button onClick={handleRestart} variant="outline" className="gap-2 h-10 rounded-xl">
                <RotateCcw className="h-4 w-4" />
                Gravar novamente
              </Button>
            )}
          </div>

          {/* Erro */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Preview dos itens parseados */}
          {showPreview && parsed && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Itens reconhecidos
              </p>

              {parsed.fornecedorNome && (
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground min-w-[80px]">Fornecedor:</span>
                  <span className="font-medium">{parsed.fornecedorNome}</span>
                </div>
              )}

              {parsed.observacoes && (
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground min-w-[80px]">Observação:</span>
                  <span>{parsed.observacoes}</span>
                </div>
              )}

              {parsed.itens.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left pb-2 font-semibold">Descrição</th>
                      <th className="text-center pb-2 font-semibold w-12">Qtd</th>
                      <th className="text-center pb-2 font-semibold w-12">Un.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.itens.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5">{item.descricao}</td>
                        <td className="py-1.5 text-center tabular-nums">{item.quantidade}</td>
                        <td className="py-1.5 text-center">{item.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Nenhum item reconhecido. Grave novamente e informe os itens com quantidade.
                </p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Os campos serão preenchidos no formulário. Você pode editar antes de salvar.
              </p>
            </div>
          )}
        </>
      )}

      {/* Rodapé */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={handleClose} className="h-10 rounded-lg">
          Cancelar
        </Button>
        {showPreview && parsed && parsed.itens.length > 0 && (
          <Button onClick={handleConfirm} className="gap-2 h-10 rounded-lg font-semibold">
            {state === 'recording' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Usar estes dados
          </Button>
        )}
      </div>
    </Modal>
  )
}
