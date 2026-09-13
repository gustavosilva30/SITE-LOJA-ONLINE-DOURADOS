import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
    MessageCircleQuestion,
    Package,
    Send,
    CheckCircle2,
    ExternalLink,
    ShoppingBag,
    X,
    MessageCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { mercadolivreApi } from '@/lib/api'
import { usePainelPolling } from '@/context/PainelPollingContext'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getApiBaseUrl } from '@/lib/apiBase'
import { hasCrmPathAccess } from '@/config/crmRoutePermissions'
import { getAuthToken } from '@/lib/auth'

const ALERT_SOUND_URL = '/assets/notification.mp3'
const BEEP_INTERVAL_MS = 14_000

type OpenQuestionRow = {
    id: string
    ml_question_id: string
    ml_account_id: string
    item_id: string
    item_title: string | null
    question_text: string
    from_nickname: string | null
    created_at: string
    mercadolivre_accounts?: { ml_nickname: string | null } | null
    produto_sku?: string | null
}

type PendingMlSale = {
    id: string
    total: number
    data_venda: string
    ml_order_id: string | null
    created_at: string
}

type UnreadMlMessage = {
    id: string
    pack_id: string
    order_id?: string
    ml_account_id: string
    ml_nickname: string | null
    text: string
    from_nickname: string
    created_at: string
    count: number
}

export function MercadoLivreAlertsToaster() {
    const { atendente, initialized } = useAuthStore()
    const { mlQuestions, mlSales, mlMessages, refreshPainel } = usePainelPolling()
    const navigate = useNavigate()
    const [hideQuestionIds, setHideQuestionIds] = useState(() => {
        if (typeof window === 'undefined') return new Set<string>()
        const saved = localStorage.getItem('crm_ml_dismissed_questions')
        return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>()
    })
    const [hideSaleIds, setHideSaleIds] = useState(() => {
        if (typeof window === 'undefined') return new Set<string>()
        const saved = localStorage.getItem('crm_ml_dismissed_sales')
        return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>()
    })
    const [hideMessageIds, setHideMessageIds] = useState(() => {
        if (typeof window === 'undefined') return new Set<string>()
        const saved = localStorage.getItem('crm_ml_dismissed_messages')
        return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>()
    })
    const [replyingId, setReplyingId] = useState<string | null>(null)
    const [replyText, setReplyText] = useState('')
    const [sendingReply, setSendingReply] = useState(false)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    const playBeep = useCallback(() => {
        const a = audioRef.current
        if (!a) return
        a.currentTime = 0
        void a.play().catch(() => {})
    }, [])

    useEffect(() => {
        localStorage.setItem('crm_ml_dismissed_questions', JSON.stringify(Array.from(hideQuestionIds)))
    }, [hideQuestionIds])

    useEffect(() => {
        localStorage.setItem('crm_ml_dismissed_sales', JSON.stringify(Array.from(hideSaleIds)))
    }, [hideSaleIds])

    useEffect(() => {
        localStorage.setItem('crm_ml_dismissed_messages', JSON.stringify(Array.from(hideMessageIds)))
    }, [hideMessageIds])

    const questions = useMemo(
        () => (mlQuestions as OpenQuestionRow[]).filter((q) => !hideQuestionIds.has(q.id)),
        [mlQuestions, hideQuestionIds]
    )
    const sales = useMemo(
        () => (mlSales as PendingMlSale[]).filter((s) => !hideSaleIds.has(s.id)),
        [mlSales, hideSaleIds]
    )
    const messages = useMemo(
        () => (mlMessages as UnreadMlMessage[]).filter((m) => !hideMessageIds.has(m.id)),
        [mlMessages, hideMessageIds]
    )

    useEffect(() => {
        const audio = new Audio(ALERT_SOUND_URL)
        audioRef.current = audio
    }, [])

    const pendingCount = questions.length + sales.length + messages.length

    useEffect(() => {
        if (pendingCount === 0) return
        playBeep()
        const t = window.setInterval(playBeep, BEEP_INTERVAL_MS)
        return () => window.clearInterval(t)
    }, [pendingCount, playBeep])

    const acknowledgeSale = async (vendaId: string) => {
        setHideSaleIds((h) => new Set(h).add(vendaId))
        try {
            await mercadolivreApi.alertAcknowledgeVenda(vendaId)
            refreshPainel()
        } catch {
            setHideSaleIds((h) => {
                const n = new Set(h)
                n.delete(vendaId)
                return n
            })
            refreshPainel()
        }
    }

    const dismissQuestionAlert = (openQuestionId: string) => {
        setHideQuestionIds((h) => new Set(h).add(openQuestionId))
        setReplyingId((cur) => (cur === openQuestionId ? null : cur))
        setReplyText('')
        void mercadolivreApi
            .alertDismissQuestion(openQuestionId)
            .then(() => {
                refreshPainel()
            })
            .catch(() => {
                setHideQuestionIds((h) => {
                    const n = new Set(h)
                    n.delete(openQuestionId)
                    return n
                })
                refreshPainel()
            })
    }

    const dismissSaleAlertOnlyForMe = (vendaId: string) => {
        setHideSaleIds((h) => new Set(h).add(vendaId))
        void mercadolivreApi
            .alertDismissVenda(vendaId)
            .then(() => {
                refreshPainel()
            })
            .catch(() => {
                setHideSaleIds((h) => {
                    const n = new Set(h)
                    n.delete(vendaId)
                    return n
                })
                refreshPainel()
            })
    }

    const dismissMessageAlert = (msgId: string, packId: string) => {
        setHideMessageIds((h) => new Set(h).add(msgId))
        void mercadolivreApi
            .alertDismissMessage(packId)
            .then(() => {
                refreshPainel()
            })
            .catch(() => {
                setHideMessageIds((h) => {
                    const n = new Set(h)
                    n.delete(msgId)
                    return n
                })
                refreshPainel()
            })
    }

    const dismissAll = async () => {
        // Fecha todos os alertas visiveis de uma só vez localmente
        const qIds = questions.map(q => q.id)
        const sIds = sales.map(s => s.id)
        const mIds = messages.map(m => m.id)
        
        setHideQuestionIds(prev => {
            const next = new Set(prev)
            qIds.forEach(id => next.add(id))
            return next
        })
        setHideSaleIds(prev => {
            const next = new Set(prev)
            sIds.forEach(id => next.add(id))
            return next
        })
        setHideMessageIds(prev => {
            const next = new Set(prev)
            mIds.forEach(id => next.add(id))
            return next
        })

        // Notifica o backend
        try {
            await Promise.allSettled([
                ...qIds.map(id => mercadolivreApi.alertDismissQuestion(id)),
                ...sIds.map(id => mercadolivreApi.alertDismissVenda(id)),
                ...messages.map(m => mercadolivreApi.alertDismissMessage(m.pack_id))
            ])
            refreshPainel()
        } catch {
            refreshPainel()
        }
    }

    const sendAnswer = async (q: OpenQuestionRow) => {
        const text = replyText.trim()
        if (!text) return
        setSendingReply(true)
        try {
            const token = getAuthToken()
            if (!token) throw new Error('Sessão expirada')
            const api = getApiBaseUrl()
            const res = await fetch(`${api}/api/mercadolivre/questions/answer`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    account_id: q.ml_account_id,
                    question_id: q.ml_question_id,
                    text,
                }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error((err as { error?: string }).error || 'Falha ao responder')
            }
            setReplyText('')
            setReplyingId(null)
            setHideQuestionIds((h) => new Set(h).add(q.id))
            refreshPainel()
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : 'Erro ao enviar resposta')
        } finally {
            setSendingReply(false)
        }
    }

    if (!initialized || !atendente?.id) return null

    return (
        <div className="fixed bottom-8 left-4 md:left-8 z-[99998] flex flex-col gap-4 max-w-sm w-full pointer-events-none">
            {/* Botão Fechar Todos */}
            <AnimatePresence>
                {pendingCount > 0 && (
                    <motion.div
                        key="dismiss-all-btn"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="pointer-events-auto flex justify-end"
                    >
                        <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5 rounded-full text-xs font-bold shadow-lg border border-border/60 backdrop-blur-sm bg-background/80"
                            onClick={dismissAll}
                        >
                            <X className="h-3.5 w-3.5" />
                            Fechar todos ({pendingCount})
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {sales.map((sale) => (
                    <motion.div
                        key={`ml-sale-${sale.id}`}
                        initial={{ opacity: 0, x: -80 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -40 }}
                        className="pointer-events-auto relative overflow-hidden rounded-2xl border-2 border-yellow-500 bg-yellow-50/95 p-5 pr-12 shadow-xl ring-2 ring-yellow-400/40 ring-offset-2 ring-offset-background dark:border-yellow-600 dark:bg-yellow-950/90"
                    >
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute right-2 top-2 h-8 w-8 shrink-0 rounded-full text-yellow-900/70 hover:bg-yellow-900/10 hover:text-yellow-950 dark:text-yellow-100/80 dark:hover:bg-yellow-100/10"
                            title="Fechar só para mim"
                            aria-label="Fechar alerta só para mim"
                            onClick={() => void dismissSaleAlertOnlyForMe(sale.id)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-500 text-yellow-950">
                                <Package className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-yellow-800 dark:text-yellow-200">
                                    Nova venda — Mercado Livre
                                </p>
                                <p className="mt-1 text-lg font-black text-yellow-950 dark:text-yellow-50">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                        Number(sale.total)
                                    )}
                                </p>
                                {sale.ml_order_id && (
                                    <p className="mt-0.5 font-mono text-[10px] text-yellow-800/80">
                                        Pedido ML #{sale.ml_order_id}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                className="flex-1 bg-yellow-600 font-bold text-yellow-50 hover:bg-yellow-700"
                                onClick={() => {
                                    void acknowledgeSale(sale.id)
                                    navigate('/vendas')
                                }}
                            >
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Ver vendas
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-yellow-700/40 font-bold"
                                onClick={() => void acknowledgeSale(sale.id)}
                            >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Reconhecer
                            </Button>
                        </div>
                        <p className="mt-2 text-[9px] text-yellow-800/70 dark:text-yellow-200/70">
                            O alerta repete até alguém reconhecer ou abrir as vendas. Fechar (X) oculta só para você.
                        </p>
                    </motion.div>
                ))}

                {messages.map((m) => (
                    <motion.div
                        key={`ml-msg-${m.id}`}
                        initial={{ opacity: 0, x: -80 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -40 }}
                        className="pointer-events-auto relative overflow-hidden rounded-2xl border-2 border-blue-500 bg-blue-50/95 p-5 pr-12 shadow-xl ring-2 ring-blue-400/40 ring-offset-2 ring-offset-background dark:border-blue-600 dark:bg-blue-950/90"
                    >
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute right-2 top-2 h-8 w-8 shrink-0 rounded-full text-blue-900/70 hover:bg-blue-900/10 hover:text-blue-950 dark:text-blue-100/80 dark:hover:bg-blue-100/10"
                            title="Fechar só para mim"
                            onClick={() => void dismissMessageAlert(m.id, m.pack_id)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-blue-50">
                                <MessageCircle className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-800 dark:text-blue-200">
                                    Nova Mensagem — ML {m.ml_nickname ? ` · ${m.ml_nickname}` : ''}
                                </p>
                                <p className="mt-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                                    {m.from_nickname} {m.count > 1 ? `(${m.count} mensagens)` : ''}
                                </p>
                                <p className="mt-1 text-sm font-semibold leading-snug text-blue-950 dark:text-blue-50 line-clamp-2">
                                    "{m.text}"
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                className="flex-1 bg-blue-600 font-bold text-white hover:bg-blue-700"
                                onClick={() => {
                                    void dismissMessageAlert(m.id, m.pack_id)
                                    navigate('/mercadolivre')
                                }}
                            >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Abrir Chat
                            </Button>
                        </div>
                    </motion.div>
                ))}

                {questions.map((q) => (
                    <motion.div
                        key={q.id}
                        initial={{ opacity: 0, x: -80 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -40 }}
                        className={cn(
                            'pointer-events-auto relative overflow-hidden rounded-2xl border-2 border-amber-500 bg-white/95 p-5 pr-12 shadow-xl ring-2 ring-amber-400/30 ring-offset-2 ring-offset-background dark:bg-slate-950/95',
                            replyingId === q.id && 'ring-amber-500'
                        )}
                    >
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute right-2 top-2 h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Fechar só para mim"
                            aria-label="Fechar alerta só para mim"
                            onClick={() => void dismissQuestionAlert(q.id)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <div className="flex gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFE600] text-slate-900">
                                <MessageCircleQuestion className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                                    Pergunta no ML
                                    {q.mercadolivre_accounts?.ml_nickname
                                        ? ` · ${q.mercadolivre_accounts.ml_nickname}`
                                        : ''}
                                </p>
                                <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
                                    {q.from_nickname || 'Comprador'} · {' '}
                                        <a 
                                            href={`https://www.mercadolivre.com.br/anuncios/lista?filters_item_id=${q.item_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-amber-600 hover:text-amber-700 hover:underline transition-colors pointer-events-auto"
                                        >
                                            {q.item_title || q.item_id}
                                        </a>
                                </p>
                                <p className="mt-2 text-sm font-semibold leading-snug text-foreground">{q.question_text}</p>
                            </div>
                        </div>

                        {replyingId === q.id ? (
                            <div className="mt-4 space-y-2">
                                <textarea
                                    autoFocus
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Sua resposta vai para o Mercado Livre..."
                                    className="h-24 w-full resize-none rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        className="flex-1 bg-amber-600 font-bold hover:bg-amber-700"
                                        disabled={!replyText.trim() || sendingReply}
                                        onClick={() => void sendAnswer(q)}
                                    >
                                        <Send className="mr-2 h-4 w-4" />
                                        Enviar
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setReplyingId(null)}>
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    className="flex-1 bg-amber-600 font-bold text-white hover:bg-amber-700"
                                    onClick={() => setReplyingId(q.id)}
                                >
                                    Responder
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 font-bold"
                                    onClick={() => navigate('/mercadolivre')}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Painel ML
                                </Button>
                            </div>
                        )}
                        <p className="mt-2 text-[9px] text-muted-foreground">
                            Som repetido até a pergunta ser respondida no ML. Fechar (X) oculta só para você; outros atendentes continuam vendo o alerta.
                        </p>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
