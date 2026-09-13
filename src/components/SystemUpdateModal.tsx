import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Sparkles, X, Megaphone } from 'lucide-react'
import { configuracoesApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface SystemUpdate {
    id: string
    titulo: string
    mensagem: string
    versao?: string
}

export function SystemUpdateModal() {
    const [update, setUpdate] = useState<SystemUpdate | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const { user } = useAuthStore()

    useEffect(() => {
        if (!user) return

        const checkUpdates = async () => {
            try {
                const pending = await configuracoesApi.checkPendingUpdates()
                if (pending && pending.id) {
                    // Verifica se já foi fechado nesta sessão para evitar flickering
                    const dismissedInSession = sessionStorage.getItem(`dismissed_update_${pending.id}`)
                    if (!dismissedInSession) {
                        setUpdate(pending)
                        setIsOpen(true)
                    }
                }
            } catch (error) {
                console.error('Erro ao buscar atualizações do sistema:', error)
            }
        }

        // Verifica logo ao montar
        checkUpdates()

        // Opcional: verificar periodicamente (ex: a cada 30 min)
        const interval = setInterval(checkUpdates, 30 * 60 * 1000)
        return () => clearInterval(interval)
    }, [user])

    const handleMarkAsRead = async () => {
        if (!update) return
        try {
            // Salva na sessão imediatamente para evitar que reapareça antes do banco atualizar
            sessionStorage.setItem(`dismissed_update_${update.id}`, 'true')
            
            await configuracoesApi.markUpdateAsRead(update.id)
            setIsOpen(false)
            // Pequeno delay para a animação de saída antes de limpar o estado
            setTimeout(() => setUpdate(null), 300)
        } catch (error) {
            console.error('Erro ao marcar atualização como lida:', error)
        }
    }

    if (!update) return null

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-card border border-border shadow-2xl rounded-2xl max-w-lg w-full overflow-hidden"
                    >
                        {/* Header com gradiente */}
                        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-6 flex items-start justify-between border-b border-border/50">
                            <div className="flex gap-4">
                                <div className="bg-primary/20 p-3 rounded-xl">
                                    <Megaphone className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                                        {update.titulo}
                                        {update.versao && (
                                            <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full uppercase font-black tracking-tighter">
                                                {update.versao}
                                            </span>
                                        )}
                                    </h2>
                                    <p className="text-xs text-muted-foreground mt-1">Novidades do Sistema</p>
                                </div>
                            </div>
                            <button 
                                onClick={handleMarkAsRead}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Conteúdo */}
                        <div className="p-8">
                            <div className="max-w-none">
                                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-base">
                                    {update.mensagem}
                                </p>
                            </div>

                            <div className="mt-8 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 text-primary/60">
                                    <Sparkles className="w-4 h-4 animate-pulse" />
                                    <span className="text-xs font-medium">Melhorando para você!</span>
                                </div>
                                <button
                                    onClick={handleMarkAsRead}
                                    className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-95"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Entendi, vamos lá!
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
