import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

/**
 * Badge global no header que aponta para /admin/pedidos.
 * - Faz polling a cada 120s no /api/admin/store-orders/contadores
 * - Mostra contador de pedidos PENDENTES (aguardando_confirmacao + aguardando_boleto)
 * - Quando o número AUMENTA, toca um beep discreto.
 * - Só aparece se o atendente tem perm_vendas (e bypass de admin).
 */
export function StoreOrdersAlert() {
    const { atendente } = useAuthStore()
    const [pendentes, setPendentes] = useState(0)
    const previousRef = useRef<number | null>(null)
    const soundOk = useRef<boolean>(true)

    const podeVer = !!(atendente && (
        (atendente as any).perm_admin ||
        (atendente as any).perm_vendas ||
        (atendente as any).perfil === 'admin'
    ))

    useEffect(() => {
        if (!podeVer) return
        let alive = true
        let t: any = null
        const tick = async () => {
            try {
                const data = await api.get('/api/admin/store-orders/contadores')
                if (!alive) return
                const total = Number(data?.aguardando_confirmacao || 0) + Number(data?.aguardando_boleto || 0)
                const prev = previousRef.current
                setPendentes(total)
                if (prev !== null && total > prev && soundOk.current) {
                    // dispara um beep curto via WebAudio (sem precisar arquivo)
                    try {
                        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
                        if (Ctx) {
                            const ctx = new Ctx()
                            const o = ctx.createOscillator()
                            const g = ctx.createGain()
                            o.connect(g); g.connect(ctx.destination)
                            o.type = 'sine'
                            o.frequency.value = 880
                            g.gain.setValueAtTime(0.0001, ctx.currentTime)
                            g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
                            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
                            o.start()
                            o.stop(ctx.currentTime + 0.4)
                        }
                    } catch { /* ignore audio errors */ }
                }
                previousRef.current = total
            } catch (err: any) {
                const msg = err?.message || ''
                if (msg.includes('403') || msg.includes('401') || msg.includes('Acesso Negado')) {
                    alive = false
                    if (t) clearInterval(t)
                }
            }
        }
        tick()
        t = setInterval(tick, 120000)
        return () => { alive = false; if (t) clearInterval(t) }
    }, [podeVer])

    if (!podeVer) return null

    return (
        <Link
            to="/admin/pedidos"
            className={cn(
                "relative inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition",
                pendentes > 0 && "animate-pulse"
            )}
            title="Pedidos da loja online aguardando ação"
        >
            <ShoppingBag className={cn("w-5 h-5", pendentes > 0 ? "text-amber-600" : "text-slate-500")} />
            {pendentes > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                    {pendentes > 99 ? '99+' : pendentes}
                </span>
            )}
        </Link>
    )
}
