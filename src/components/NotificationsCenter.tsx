import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCircle2, AlertCircle, ShoppingBag, Package, Smartphone, Globe } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePainelPolling } from '@/context/PainelPollingContext'
import { toast } from 'sonner'
import { mercadolivreApi } from '@/lib/api'

interface Notification {
    id: string
    title: string
    message: string
    type: 'sale' | 'stock' | 'system' | 'ml' | 'store'
    time: string
    read: boolean
    rawTime?: string | null
}

export function NotificationsCenter() {
    const { notificationsPreview, pollIntervalMs, mlQuestions, mlSales, mlMessages } = usePainelPolling()
    const [open, setOpen] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('crm_seen_notifications')
            if (saved) {
                const arr = JSON.parse(saved)
                if (Array.isArray(arr)) return new Set(arr)
            }
        } catch (e) {
            console.error('Error loading seen notifications:', e)
        }
        return new Set()
    })

    const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('crm_dismissed_notifications')
            if (saved) {
                const arr = JSON.parse(saved)
                if (Array.isArray(arr)) return new Set(arr)
            }
        } catch (e) {
            console.error('Error loading dismissed notifications:', e)
        }
        return new Set()
    })

    const primedRef = useRef(false)

    useEffect(() => {
        try {
            const arrSeen = Array.from(seenNotificationIds).slice(-200)
            localStorage.setItem('crm_seen_notifications', JSON.stringify(arrSeen))
            
            const arrDismissed = Array.from(dismissedNotificationIds).slice(-200)
            localStorage.setItem('crm_dismissed_notifications', JSON.stringify(arrDismissed))
        } catch (e) {
            console.error('Error saving notification states:', e)
        }
    }, [seenNotificationIds, dismissedNotificationIds])

    const playNotificationSound = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.play().catch((e) => console.log('Audio error:', e))
        }
    }, [])

    const buildFromPreview = useCallback(
        (data: {
            low_stock_count: number
            recent_sales: { id: string; total: number; origem_ml: boolean; data_venda: string | null }[]
            recent_store_orders: { id: string; total: number; order_number: string; created_at: string | null }[]
        }): Notification[] => {
            const notifs: Notification[] = []
            const lowStock = Math.max(0, Number(data.low_stock_count) || 0)
            if (lowStock > 0) {
                notifs.push({
                    id: 'stock-alert',
                    title: 'Estoque Crítico',
                    message: `${lowStock} produto(s) com mínimo configurado e estoque no limite ou abaixo.`,
                    type: 'stock',
                    time: 'Agora',
                    read: false,
                })
            }
            for (const o of data.recent_store_orders || []) {
                const totalNum = Number(o.total ?? 0) || 0
                notifs.push({
                    id: `store-${o.id}`,
                    title: 'Novo pedido na Loja Online',
                    message: `Pedido #${o.order_number} no valor de R$ ${totalNum.toFixed(2)} recebido.`,
                    type: 'store',
                    time: o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Recente',
                    read: false,
                    rawTime: o.created_at
                })
            }
            for (const s of data.recent_sales || []) {
                const isML = !!s.origem_ml
                notifs.push({
                    id: `sale-${s.id}`,
                    title: isML ? 'Venda no Mercado Livre' : 'Nova Venda Concluída',
                    message: `Venda #${s.id} no valor de R$ ${Number(s.total).toFixed(2)} registrada.`,
                    type: isML ? 'ml' : 'sale',
                    time: s.data_venda ? new Date(s.data_venda).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Hoje',
                    read: false,
                    rawTime: s.data_venda
                })
            }
            return notifs
        },
        []
    )

    const buildFromML = useCallback(
        (questions: any[], sales: any[], messages: any[]): Notification[] => {
            const notifs: Notification[] = []
            for (const q of questions || []) {
                notifs.push({
                    id: `ml-q-${q.id}`,
                    title: 'Pergunta no Mercado Livre',
                    message: q.question_text || 'Nova pergunta recebida.',
                    type: 'ml',
                    time: q.created_at ? new Date(q.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Agora',
                    read: false,
                    rawTime: q.created_at
                })
            }
            for (const s of sales || []) {
                notifs.push({
                    id: `ml-sale-p-${s.id}`,
                    title: 'Venda Pendente ML',
                    message: `Venda #${s.ml_order_id || s.id} pendente. Total: R$ ${Number(s.total).toFixed(2)}`,
                    type: 'ml',
                    time: s.created_at ? new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Agora',
                    read: false,
                    rawTime: s.created_at
                })
            }
            for (const m of messages || []) {
                notifs.push({
                    id: `ml-msg-${m.pack_id || m.id}`,
                    title: 'Mensagem no Mercado Livre',
                    message: `${m.from_nickname || 'Comprador'}: ${m.text}`,
                    type: 'ml',
                    time: m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Agora',
                    read: false,
                    rawTime: m.created_at
                })
            }
            return notifs
        },
        []
    )

    useEffect(() => {
        const audio = new Audio('/assets/notification.mp3')
        audioRef.current = audio
    }, [])

    useEffect(() => {
        try {
            const previewNotifs = notificationsPreview ? buildFromPreview(notificationsPreview) : []
            const mlNotifs = buildFromML(mlQuestions, mlSales, mlMessages)
            const allCurrentNotifs = [...previewNotifs, ...mlNotifs]

            const isRecent = (dateStr: string | null | undefined) => {
                if (!dateStr) return false
                const date = new Date(dateStr)
                const diffMs = new Date().getTime() - date.getTime()
                return diffMs < 300000
            }

            if (!primedRef.current) {
                setSeenNotificationIds(prev => {
                    const initialSeen = new Set(prev)
                    for (const n of allCurrentNotifs) initialSeen.add(n.id)
                    return initialSeen
                })
                primedRef.current = true
            } else {
                setSeenNotificationIds(prev => {
                    const newSeenIds = new Set(prev)
                    let hasChanges = false

                    for (const n of allCurrentNotifs) {
                        if (newSeenIds.has(n.id)) continue
                        
                        const shouldAlert = (n.type === 'ml' || n.type === 'sale' || n.type === 'store') 
                        const isNewEvent = isRecent(n.rawTime)

                        if (shouldAlert && isNewEvent) {
                            if (n.type === 'store') {
                                playNotificationSound()
                                toast.success('NOVO PEDIDO: Loja Online 🛍️', { description: n.message })
                            } else if (n.type === 'sale') {
                                playNotificationSound()
                                toast.info('NOVA VENDA: CRM ✅', { description: n.message })
                            } else if (n.type === 'ml') {
                                playNotificationSound()
                                if (n.id.includes('ml-q-')) {
                                    toast.info('PERGUNTA: Mercado Livre ❓', { description: n.message })
                                } else {
                                    toast.info('ALERTA: Mercado Livre 🟠', { description: n.message })
                                }
                            }
                        }
                        
                        newSeenIds.add(n.id)
                        hasChanges = true
                    }

                    return hasChanges ? newSeenIds : prev
                })
            }

            setNotifications((prev) => {
                const system = prev.filter(x => x.type === 'system')
                const next = allCurrentNotifs
                    .filter(n => !dismissedNotificationIds.has(n.id))
                    .map(n => {
                        const old = prev.find(p => p.id === n.id)
                        return old ? { ...n, read: old.read } : n
                    })
                return [...next, ...system].slice(0, 40)
            })
        } catch (e) {
            console.error('Error in NotificationsCenter effect:', e)
        }
    }, [notificationsPreview, mlQuestions, mlSales, mlMessages, buildFromPreview, buildFromML, playNotificationSound, dismissedNotificationIds])

    const handleDismiss = async (notif: Notification) => {
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
        
        // Adiciona aos ignorados localmente para não aparecer mais para este atendente
        const next = new Set(dismissedNotificationIds)
        next.add(notif.id)
        setDismissedNotificationIds(next)
    }

    const handleClearAll = async () => {
        const toDismiss = notifications.filter(n => !n.read)
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
        
        for (const n of toDismiss) {
            await handleDismiss(n).catch(() => {})
        }
    }

    const unreadCount = notifications.filter(n => !n.read).length

    return (
        <div className="fixed md:top-6 md:right-8 top-2 right-3.5 z-50">
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2.5 rounded-full bg-card border border-border/50 shadow-sm hover:shadow-md transition-all hover:bg-muted group overflow-hidden"
            >
                <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <Bell className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors relative z-10" />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center border-2 border-background animate-pulse z-20">
                        {unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40 bg-black/5 backdrop-blur-[2px]"
                            onClick={() => setOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="absolute right-0 top-14 w-80 bg-card/90 backdrop-blur-2xl border border-border shadow-2xl rounded-2xl overflow-hidden z-50"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
                                <div>
                                    <h3 className="font-bold tracking-tight">Painel de Alertas</h3>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                        Atualização automática (~{Math.round(pollIntervalMs / 1000)}s)
                                    </p>
                                </div>
                                <span className="text-[10px] uppercase font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full tracking-widest border border-primary/20">
                                    {unreadCount} Novas
                                </span>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="p-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center animate-pulse">
                                            <CheckCircle2 className="w-6 h-6 opacity-20" />
                                        </div>
                                        <p className="font-medium">Nenhum alerta pendente</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border/30">
                                        {notifications.map((notif) => {
                                            const Icons = {
                                                sale: ShoppingBag,
                                                stock: Package,
                                                ml: Smartphone,
                                                store: Globe,
                                                system: AlertCircle
                                            };
                                            const Icon = Icons[notif.type] || AlertCircle;
                                            
                                            const Colors = {
                                                sale: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
                                                store: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
                                                ml: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
                                                stock: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
                                                system: 'text-slate-500 bg-slate-500/10 border-slate-500/20'
                                            };
                                            const colorClass = Colors[notif.type] || Colors.system;

                                            return (
                                                <motion.div 
                                                    key={notif.id} 
                                                    className={`p-4 flex gap-3 hover:bg-muted/50 transition-colors cursor-pointer relative ${notif.read ? 'opacity-60' : ''}`}
                                                    onClick={() => handleDismiss(notif)}
                                                >
                                                    {!notif.read && (
                                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                                                    )}
                                                    <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${colorClass} shadow-sm`}>
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                                            <h4 className="text-sm font-bold text-foreground leading-none truncate">{notif.title}</h4>
                                                            <span className="text-[9px] text-muted-foreground whitespace-nowrap font-mono font-bold bg-muted px-1.5 py-0.5 rounded uppercase tracking-tighter">{notif.time}</span>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">{notif.message}</p>
                                                    </div>
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="p-3 bg-muted/30 border-t border-border/50 text-center flex items-center justify-center gap-4">
                                <button
                                    onClick={handleClearAll}
                                    className="text-[10px] font-black text-primary hover:text-primary/80 transition-colors uppercase tracking-widest bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10"
                                >
                                    Limpar Tudo
                                </button>
                                <button
                                    className="text-[10px] font-black text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
                                    onClick={() => setOpen(false)}
                                >
                                    Fechar
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}

