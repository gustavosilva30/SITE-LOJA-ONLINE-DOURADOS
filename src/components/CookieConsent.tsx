import { useState, useEffect } from 'react'
import { Cookie, X, Check, Shield } from 'lucide-react'
import { isAutopecasPublicSiteHost } from '@/lib/publicSiteHost'

/**
 * Banner de Cookies & Privacidade em conformidade com a LGPD e o
 * Guia Orientativo de Cookies da ANPD (outubro/2022).
 *
 * Oferece escolha clara e simétrica:
 * - "Aceitar Todos": habilita armazenamento essencial + métricas estatísticas anônimas da loja.
 * - "Apenas Essenciais": mantém apenas carrinho e sessão de login (imprescindíveis para compras),
 *   desativando qualquer rastreamento analítico (analytics.ts).
 *
 * Permite reabertura a qualquer momento via evento customizado 'open-cookie-settings'
 * acionado pelo rodapé da loja.
 */
export function CookieConsent() {
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const analyticsConsent = localStorage.getItem('dourados_cookie_analytics')
        // Se ainda não houver escolha explícita registrada
        if (!analyticsConsent) {
            const timer = setTimeout(() => setIsOpen(true), 1000)
            return () => clearTimeout(timer)
        }
    }, [])

    useEffect(() => {
        const handleOpen = () => setIsOpen(true)
        window.addEventListener('open-cookie-settings', handleOpen)
        return () => window.removeEventListener('open-cookie-settings', handleOpen)
    }, [])

    const handleAcceptAll = () => {
        localStorage.setItem('dourados_cookie_consent', 'acknowledged')
        localStorage.setItem('dourados_cookie_consent_v2', 'acknowledged')
        localStorage.setItem('dourados_cookie_analytics', 'accepted')
        localStorage.setItem('lgpd_cookie_consent', 'acknowledged')
        localStorage.setItem('landing_lgpd_cookie', '1')
        window.dispatchEvent(new CustomEvent('cookie-consent-updated', { detail: { analytics: true } }))
        setIsOpen(false)

        // Dispara o tracking da página atual após aceitar, apenas se estiver no domínio da loja pública
        try {
            if (typeof window !== 'undefined' && isAutopecasPublicSiteHost(window.location.hostname)) {
                import('../store/lib/analytics').then((m) => m.track('pageview'))
            }
        } catch {
            // ignore
        }
    }

    const handleRejectOptional = () => {
        localStorage.setItem('dourados_cookie_consent', 'acknowledged')
        localStorage.setItem('dourados_cookie_consent_v2', 'acknowledged')
        localStorage.setItem('dourados_cookie_analytics', 'rejected')
        localStorage.setItem('lgpd_cookie_consent', 'acknowledged')
        localStorage.setItem('landing_lgpd_cookie', '1')

        // Remove identificador estatístico se existente
        try {
            localStorage.removeItem('dourados_visitor_id')
        } catch {
            // ignore
        }

        window.dispatchEvent(new CustomEvent('cookie-consent-updated', { detail: { analytics: false } }))
        setIsOpen(false)
    }

    if (!isOpen) return null

    return (
        <div className="fixed bottom-6 left-6 right-6 z-[9999] md:max-w-xl md:left-auto md:right-6 animate-in slide-in-from-bottom-5 duration-500">
            <div className="bg-[#001A54]/95 backdrop-blur-md border border-[#B6D433]/30 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-[2rem] p-6 text-white">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-[#B6D433]/15 text-[#B6D433] rounded-2xl shrink-0">
                        <Cookie className="w-6 h-6 animate-pulse" />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-black uppercase italic tracking-tighter text-[#B6D433] text-lg">
                                    Cookies & Privacidade
                                </h4>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#B6D433]/20 text-[#B6D433] tracking-wide uppercase">
                                    <Shield className="w-3 h-3" /> LGPD
                                </span>
                            </div>
                            <p className="text-xs md:text-sm text-white/80 leading-relaxed mt-1.5 font-medium">
                                Usamos armazenamento técnico essencial (seu carrinho de compras e sua sessão de login)
                                para que a loja funcione, e estatísticas de uso anônimas para entender a navegação e
                                melhorar nossos serviços. Não usamos cookies de publicidade de terceiros.
                                Você pode escolher aceitar todas as preferências ou manter apenas as estritamente essenciais.
                                Saiba mais na nossa{' '}
                                <a
                                    href="/legal/privacy"
                                    className="text-[#B6D433] hover:underline font-bold"
                                >
                                    Política de Privacidade
                                </a>.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 pt-1">
                            <button
                                onClick={handleAcceptAll}
                                className="w-full sm:w-auto px-5 py-3 bg-[#B6D433] hover:bg-[#a5c22b] text-[#001A54] font-black uppercase italic tracking-tighter text-xs md:text-sm rounded-xl transition-all duration-300 shadow-lg shadow-[#B6D433]/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <Check className="w-4 h-4" />
                                Aceitar Todos
                            </button>
                            <button
                                onClick={handleRejectOptional}
                                className="w-full sm:w-auto px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white font-black uppercase italic tracking-tighter text-xs md:text-sm rounded-xl transition-all duration-300 active:scale-95 text-center cursor-pointer"
                            >
                                Apenas Essenciais
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={handleRejectOptional}
                        className="text-white/40 hover:text-white transition p-1"
                        title="Fechar e manter apenas essenciais"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
