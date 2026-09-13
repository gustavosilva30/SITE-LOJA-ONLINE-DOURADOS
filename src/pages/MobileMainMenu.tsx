import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { 
    MagnifyingGlass, CaretRight, SignOut, Gear, PaintBrush
} from "@phosphor-icons/react"
import { useAuthStore } from "@/store/authStore"
import { useUIStore } from "@/store/uiStore"
import { usePainelPolling } from "@/context/PainelPollingContext"
import {
    CRM_NAV_ITEMS,
    hasCrmPathAccess,
    isManagerAtendente,
    sortNavByHrefOrder,
    SIDEBAR_CADASTROS_HREF_ORDER,
    SIDEBAR_FINANCEIRO_HREF_ORDER,
    SIDEBAR_ADMIN_HREF_ORDER,
    SIDEBAR_ONLINE_HREF_ORDER,
    type CrmNavItemDef
} from "@/config/crmRoutePermissions"
import { Bell } from "lucide-react"

function useFilteredNav(items: CrmNavItemDef[], atendente: any) {
  return useMemo(() => {
    if (!atendente) return []
    return items.filter((item) => {
      if (item.href === "/admin/marketing" && !isManagerAtendente(atendente)) return false
      return hasCrmPathAccess(item.href, atendente)
    })
  }, [items, atendente])
}

export function MobileMainMenu() {
    const navigate = useNavigate()
    const { atendente, signOut } = useAuthStore()
    const { setImageEditorOpen } = useUIStore()
    const { sidebarCounts } = usePainelPolling()
    const [searchQuery, setSearchQuery] = useState("")

    const counts = useMemo(
        () => ({
            lembretes: sidebarCounts.lembretes,
            entregas: sidebarCounts.entregas,
            carrinho: sidebarCounts.carrinho,
            recados: sidebarCounts.recados,
            usoInterno: sidebarCounts.uso_interno,
        }),
        [sidebarCounts]
    )

    const sidebarPool = useMemo(() => CRM_NAV_ITEMS.filter((i) => i.navGroup !== "extra"), [])
    
    const principalPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "principal"), [sidebarPool])
    const cadastrosPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "cadastros"), [sidebarPool])
    const financeiroPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "financeiro"), [sidebarPool])
    const adminPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "administracao"), [sidebarPool])
    const onlinePool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "online"), [sidebarPool])

    const cadastrosSorted = useMemo(() => sortNavByHrefOrder(cadastrosPool, SIDEBAR_CADASTROS_HREF_ORDER), [cadastrosPool])
    const financeiroSorted = useMemo(() => sortNavByHrefOrder(financeiroPool, SIDEBAR_FINANCEIRO_HREF_ORDER), [financeiroPool])
    const adminSorted = useMemo(() => sortNavByHrefOrder(adminPool, SIDEBAR_ADMIN_HREF_ORDER), [adminPool])
    const onlineSorted = useMemo(() => sortNavByHrefOrder(onlinePool, SIDEBAR_ONLINE_HREF_ORDER), [onlinePool])

    const filteredPrincipal = useFilteredNav(principalPool, atendente)
    const filteredCadastros = useFilteredNav(cadastrosSorted, atendente)
    const filteredFinanceiro = useFilteredNav(financeiroSorted, atendente)
    const filteredAdmin = useFilteredNav(adminSorted, atendente)
    const filteredOnline = useFilteredNav(onlineSorted, atendente)

    const showConfigLink = atendente && hasCrmPathAccess("/configuracoes", atendente)

    const handleLogout = async () => {
        await signOut()
        window.location.href = "/login"
    }

    // Build the full list of cards to display
    const allCards = useMemo(() => {
        const cards: any[] = []

        // 1. Principal Items (Direct Links)
        filteredPrincipal.forEach(item => {
            let badge = 0
            if (item.label === "Lembretes") badge = counts.lembretes
            if (item.label === "Entregas") badge = counts.entregas
            if (item.label === "Recados") badge = counts.recados

            cards.push({
                type: 'link',
                label: item.label,
                icon: item.icon,
                colorClass: item.colorClass,
                href: item.href,
                badge
            })
        })

        // Editor Pro
        cards.push({
            type: 'action',
            label: "Editor Pro",
            icon: PaintBrush,
            colorClass: "text-purple-500",
            onClick: () => {
                setImageEditorOpen(true)
                navigate("/") // or somewhere else, or just close menu
            },
            badgeText: "NOVO"
        })

        // 2. Folder Groups
        if (filteredCadastros.length > 0) {
            cards.push({ type: 'folder', label: "Cadastros", icon: CRM_NAV_ITEMS.find(i => i.navGroup === 'cadastros')?.icon || Gear, href: "/menu/cadastros" })
        }
        if (filteredFinanceiro.length > 0) {
            cards.push({ type: 'folder', label: "Financeiro", icon: CRM_NAV_ITEMS.find(i => i.navGroup === 'financeiro')?.icon || Gear, href: "/menu/financeiro" })
        }
        if (filteredAdmin.length > 0) {
            cards.push({ type: 'folder', label: "Administração", icon: CRM_NAV_ITEMS.find(i => i.navGroup === 'administracao')?.icon || Gear, href: "/menu/administracao" })
        }
        if (filteredOnline.length > 0) {
            cards.push({ type: 'folder', label: "Online", icon: CRM_NAV_ITEMS.find(i => i.navGroup === 'online')?.icon || Gear, href: "/menu/online" })
        }

        // 3. Configurações
        if (showConfigLink) {
            cards.push({ type: 'link', label: "Configurações", icon: Gear, colorClass: "text-slate-500", href: "/configuracoes" })
        }

        // 4. Sair
        cards.push({ type: 'action', label: "Sair", icon: SignOut, colorClass: "text-destructive", onClick: handleLogout })

        return cards
    }, [filteredPrincipal, filteredCadastros, filteredFinanceiro, filteredAdmin, filteredOnline, showConfigLink, counts])

    // Search filter
    const displayCards = useMemo(() => {
        if (!searchQuery.trim()) return allCards
        const q = searchQuery.toLowerCase()
        return allCards.filter(c => c.label.toLowerCase().includes(q))
    }, [allCards, searchQuery])

    return (
        <div className="min-h-[100dvh] bg-[#1e2329] text-slate-100 pb-24 md:hidden font-sans flex flex-col">
            {/* Top Bar escura integrada */}
            <div className="flex items-center justify-between pl-4 pr-14 py-4 bg-[#1e2329] shrink-0">
                <div className="flex items-center gap-3">
                    <span className="font-bold text-base text-white tracking-wide">Dourados Auto Peças</span>
                </div>
                {/* O StoreOrdersAlert (sino) é renderizado em position absolute no Layout, 
                    o pr-14 acima garante que este texto não fique em cima do sino */}
            </div>

            <div className="px-4 pb-2 sticky top-0 bg-[#1e2329]/95 backdrop-blur-md z-20">
                <div className="relative">
                    <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-[#161a1f] border-none rounded-2xl text-sm text-white placeholder:text-slate-500 focus:outline-none shadow-[inset_2px_2px_5px_rgba(0,0,0,0.5),inset_-1px_-1px_3px_rgba(255,255,255,0.05)] transition-all"
                    />
                </div>
            </div>

            <div className="relative z-10 px-4 mt-4 grid grid-cols-3 gap-3 sm:gap-4">
                {displayCards.map((card, idx) => {
                    const Icon = card.icon
                    const isFolder = card.type === 'folder'
                    const isConfig = card.label === "Configurações" || card.label === "Sair";
                    
                    const getCardColor = (label: string) => {
                        const l = label.toLowerCase();
                        if (l.includes("entrega")) return "bg-gradient-to-br from-[#0e8a94] to-[#0b6b74]"; // Teal
                        if (l.includes("lembrete")) return "bg-gradient-to-br from-[#27ae60] to-[#1e8449]"; // Mint Green
                        if (l.includes("manutenç")) return "bg-gradient-to-br from-[#229954] to-[#196f3d]"; // Classic Green
                        if (l.includes("venda") && !l.includes("ponto")) return "bg-gradient-to-br from-[#c97b14] to-[#a06210]"; // Orange/Brown
                        if (l.includes("recado") || l.includes("uso interno")) return "bg-gradient-to-br from-[#bda628] to-[#96841e]"; // Gold/Yellow
                        if (l.includes("pedido") || l.includes("orçamento") || l.includes("leilão") || l.includes("troca")) return "bg-gradient-to-br from-[#b8860b] to-[#8b6508]"; // Dark Amber
                        if (l.includes("editor")) return "bg-gradient-to-br from-[#7a49a5] to-[#5b377a]"; // Purple
                        if (l.includes("cadastro") || l.includes("cliente") || l.includes("fornecedor") || l.includes("produto") || l.includes("veículo")) return "bg-gradient-to-br from-[#922b6c] to-[#6a1f4e]"; // Magenta
                        if (l.includes("financeiro") || l.includes("caixa") || l.includes("boleto") || l.includes("fiscal")) return "bg-gradient-to-br from-[#6b3a8e] to-[#4e2b67]"; // Deep Purple
                        if (l.includes("administraç") || l.includes("relatório") || l.includes("meta") || l.includes("log") || l.includes("configuração")) return "bg-gradient-to-br from-[#73828c] to-[#556068]"; // Silver/Gray
                        if (l.includes("online") || l.includes("whatsapp") || l.includes("atendimento")) return "bg-gradient-to-br from-[#0faab2] to-[#0a7a80]"; // Bright Cyan
                        if (l.includes("sair")) return "bg-gradient-to-br from-[#c0392b] to-[#922b21]"; // Red
                        return "bg-gradient-to-br from-slate-600 to-slate-800"; // default
                    }

                    const cardBg = getCardColor(card.label)
                    
                    return (
                        <motion.button
                            key={card.label}
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ delay: idx * 0.02, type: "spring", stiffness: 300, damping: 20 }}
                            onClick={() => {
                                if (card.type === 'link' || card.type === 'folder') {
                                    navigate(card.href)
                                } else if (card.type === 'action' && card.onClick) {
                                    card.onClick()
                                }
                            }}
                            className={`relative flex ${isConfig ? 'flex-row col-span-3 items-center justify-start py-3 px-4 gap-3' : 'flex-col items-center justify-center p-3 aspect-square'} rounded-[20px] ${cardBg} transition-all border-none group select-none`}
                            style={{
                                boxShadow: "0 8px 15px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.25), inset -2px -2px 6px rgba(0,0,0,0.3)"
                            }}
                        >
                            {/* Ribbon para Editor Pro */}
                            {card.badgeText && (
                                <div className="absolute -top-0.5 -left-0.5 overflow-hidden w-16 h-16 rounded-tl-[20px] pointer-events-none">
                                    <div className="absolute top-4 -left-[1.1rem] w-[5.5rem] bg-[#c0392b] text-white text-[8px] font-bold py-[3px] text-center -rotate-45 shadow-[0_2px_4px_rgba(0,0,0,0.4)] border-b border-[#922b21] uppercase tracking-wider">
                                        {card.badgeText}
                                    </div>
                                </div>
                            )}

                            {/* Ícone 3D Escavado (Recessed) */}
                            <div 
                                className={`${isConfig ? 'w-10 h-10' : 'w-12 h-12 mb-2.5'} rounded-[14px] flex items-center justify-center shrink-0`}
                                style={{
                                    background: "rgba(255,255,255,0.06)",
                                    boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.3), inset -1px -1px 3px rgba(255,255,255,0.15)"
                                }}
                            >
                                <Icon weight="duotone" className="w-5 h-5 sm:w-6 sm:h-6 text-[#f8fafc] drop-shadow-md" />
                            </div>

                            <span className={`font-bold uppercase tracking-wider text-[#f8fafc] ${isConfig ? 'text-[11px] text-left leading-snug' : 'text-[9px] sm:text-[10px] w-full px-1 text-center leading-[1.2] break-words'}`}>
                                {card.label}
                                {isConfig && card.label === "Configurações" && (
                                    <span className="block text-[8.5px] font-normal tracking-normal text-white/70 mt-0.5 capitalize">
                                        Opções e preferências do sistema.
                                    </span>
                                )}
                            </span>

                            {card.badge > 0 && (
                                <div className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[22px] h-[22px] px-1 bg-[#e74c3c] rounded-full border-[2.5px] border-[#1e2329] shadow-sm z-10">
                                    <span className="text-white text-[10px] font-bold leading-none">{card.badge}</span>
                                </div>
                            )}
                        </motion.button>
                    )
                })}
                
                {displayCards.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                        Nenhum resultado encontrado.
                    </div>
                )}
            </div>
        </div>
    )
}
