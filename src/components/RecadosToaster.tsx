import { useState, useEffect, useMemo } from 'react'
import { X, MessageSquare, User, CheckCircle2, Send, CornerDownRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { recadosApi } from '@/lib/api'
import { usePainelPolling } from '@/context/PainelPollingContext'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

interface Recado {
    id: string
    mensagem: string
    remetente_id: string
    remetente_nome?: string
    created_at: string
    urgente: boolean
}

export function RecadosToaster() {
    const { atendente, initialized } = useAuthStore()
    const { recadosNaoLidos, refreshPainel } = usePainelPolling()
    const [hiddenIds, setHiddenIds] = useState<Record<string, true>>({})
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyText, setReplyText] = useState('')
    const [sendingReply, setSendingReply] = useState(false)

    useEffect(() => {
        setHiddenIds((h) => {
            const next = { ...h }
            const alive = new Set(recadosNaoLidos.map((r) => r.id))
            for (const k of Object.keys(next)) {
                if (!alive.has(k)) delete next[k]
            }
            return next
        })
    }, [recadosNaoLidos])

    const activeRecados = useMemo(
        () =>
            recadosNaoLidos
                .filter((r) => !hiddenIds[r.id])
                .map(
                    (r): Recado => ({
                        id: r.id,
                        mensagem: r.mensagem,
                        remetente_id: r.remetente_id,
                        remetente_nome: r.remetente_nome || 'Atendente',
                        created_at: r.created_at,
                        urgente: r.urgente,
                    })
                ),
        [recadosNaoLidos, hiddenIds]
    )

    const dismissRecado = (id: string) => {
        setHiddenIds((h) => ({ ...h, [id]: true }))
        if (replyingTo === id) {
            setReplyingTo(null)
            setReplyText('')
        }
    }

    const markAsRead = async (id: string) => {
        try {
            await recadosApi.marcarLido(id)
            dismissRecado(id)
            refreshPainel()
        } catch {
            /* falha silenciosa — usuário pode tentar de novo */
        }
    }

    const handleSendReply = async (recado: Recado) => {
        if (!replyText.trim() || !atendente?.id) return

        setSendingReply(true)
        try {
            await recadosApi.enviar({
                destinatario_id: recado.remetente_id,
                mensagem: `RE: ${replyText}`,
                urgente: recado.urgente,
            })

            // Marcar o original como lido após responder
            await markAsRead(recado.id)
            setReplyText('')
            setReplyingTo(null)
        } catch (err) {
            console.error('Error sending reply:', err)
        } finally {
            setSendingReply(false)
        }
    }

    return (
        <div className="fixed bottom-8 right-8 z-[99999] flex flex-col gap-4 max-w-sm w-full pointer-events-none">
            <AnimatePresence>
                {activeRecados.map((recado) => (
                    <motion.div
                        key={recado.id}
                        initial={{ opacity: 0, scale: 0.5, y: 100, rotate: -5 }}
                        animate={{
                            opacity: 1,
                            scale: [0.5, 1.1, 1],
                            y: 0,
                            rotate: 0,
                            transition: {
                                type: "spring",
                                stiffness: 400,
                                damping: 15
                            }
                        }}
                        exit={{ opacity: 0, scale: 0.8, x: 100 }}
                        className={cn(
                            "pointer-events-auto relative overflow-hidden bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-2 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] rounded-[2.5rem] p-6 flex flex-col gap-4 transition-all hover:shadow-primary/30",
                            recado.urgente ? "border-rose-500 ring-4 ring-rose-500/10" : "border-primary/20",
                            replyingTo === recado.id && "ring-2 ring-primary"
                        )}
                    >
                        <div className="flex gap-5">
                            <div className={cn(
                                "shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner",
                                recado.urgente ? "bg-rose-500 text-white" : "bg-primary text-primary-foreground"
                            )}>
                                <MessageSquare className="w-7 h-7" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <span className="text-[11px] font-black uppercase tracking-[0.1em] text-primary flex items-center gap-2">
                                        <User className="w-4 h-4" /> {recado.remetente_nome}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/60 font-mono bg-muted/50 px-2.5 py-1 rounded-full">
                                        {new Date(recado.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-[15px] font-bold text-foreground leading-[1.3] line-clamp-3 tracking-tight">
                                    {recado.mensagem}
                                </p>
                            </div>
                        </div>

                        <AnimatePresence>
                            {replyingTo === recado.id ? (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex flex-col gap-2 mt-2">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary/60 ml-1">
                                            <CornerDownRight className="w-3 h-3" /> Sua Resposta
                                        </div>
                                        <div className="relative">
                                            <textarea
                                                autoFocus
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                placeholder="Digite sua resposta..."
                                                className="w-full bg-muted/50 border-border/50 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all resize-none h-24 font-medium"
                                            />
                                            <button
                                                disabled={!replyText.trim() || sendingReply}
                                                onClick={() => handleSendReply(recado)}
                                                className="absolute bottom-3 right-3 p-2 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-50 transition-all"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setReplyingTo(null)}
                                            className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors self-end mr-2"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex gap-3 mt-2">
                                    <button
                                        onClick={() => setReplyingTo(recado.id)}
                                        className="flex-1 text-[11px] font-black uppercase tracking-[0.05em] py-3 bg-primary text-primary-foreground rounded-2xl hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/30 flex items-center justify-center gap-2"
                                    >
                                        Responder
                                    </button>
                                    <button
                                        onClick={() => markAsRead(recado.id)}
                                        className="px-5 text-[11px] font-black uppercase tracking-[0.05em] py-3 bg-muted text-muted-foreground rounded-2xl hover:bg-muted/80 transition-all active:scale-95 border border-border/50 flex items-center gap-2"
                                    >
                                        <CheckCircle2 className="w-4 h-4" /> Lido
                                    </button>
                                </div>
                            )}
                        </AnimatePresence>

                        <button
                            onClick={() => dismissRecado(recado.id)}
                            className="absolute top-5 right-5 text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
