import { useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { useAuthStore } from "@/store/authStore"
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

export function MobileSubMenu() {
    const { category } = useParams()
    const navigate = useNavigate()
    const { atendente } = useAuthStore()
    const { sidebarCounts } = usePainelPolling()

    const counts = useMemo(
        () => ({
            usoInterno: sidebarCounts.uso_interno,
        }),
        [sidebarCounts]
    )

    const pool = useMemo(() => CRM_NAV_ITEMS.filter((i) => i.navGroup === category), [category])
    
    const sortedPool = useMemo(() => {
        if (category === "cadastros") return sortNavByHrefOrder(pool, SIDEBAR_CADASTROS_HREF_ORDER)
        if (category === "financeiro") return sortNavByHrefOrder(pool, SIDEBAR_FINANCEIRO_HREF_ORDER)
        if (category === "administracao") return sortNavByHrefOrder(pool, SIDEBAR_ADMIN_HREF_ORDER)
        if (category === "online") return sortNavByHrefOrder(pool, SIDEBAR_ONLINE_HREF_ORDER)
        return pool
    }, [pool, category])

    const filteredItems = useFilteredNav(sortedPool, atendente)

    const titleMap: Record<string, string> = {
        cadastros: "Cadastros",
        financeiro: "Financeiro",
        administracao: "Administração",
        online: "Online",
    }
    const title = category && titleMap[category] ? titleMap[category] : "Menu"

    return (
        <div className="min-h-[100dvh] bg-[#1e2329] text-slate-100 pb-24 md:hidden flex flex-col font-sans">
            <div className="pt-6 px-4 pb-4 sticky top-0 bg-[#1e2329]/95 backdrop-blur-md z-20 flex items-center gap-3">
                <button 
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/10 transition-colors text-white"
                >
                    <CaretLeft weight="bold" className="w-6 h-6" />
                    <span className="font-semibold text-[15px]">{title}</span>
                </button>
            </div>

            <div className="relative z-10 px-4 py-4 grid grid-cols-3 gap-3 sm:gap-4">
                {filteredItems.map((item, idx) => {
                    const Icon = item.icon
                    const showBadge = item.label === "Uso Interno & Faltas" && counts.usoInterno > 0

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

                    const cardBg = getCardColor(item.label)

                    return (
                        <motion.button
                            key={item.href}
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ delay: idx * 0.02, type: "spring", stiffness: 300, damping: 20 }}
                            onClick={() => navigate(item.href)}
                            className={`relative flex flex-col items-center justify-center p-3 rounded-[20px] ${cardBg} transition-all border-none text-center aspect-square group select-none`}
                            style={{
                                boxShadow: "0 8px 15px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.25), inset -2px -2px 6px rgba(0,0,0,0.3)"
                            }}
                        >
                            {/* Ícone 3D Escavado (Recessed) */}
                            <div 
                                className="w-12 h-12 mb-2.5 rounded-[14px] flex items-center justify-center shrink-0"
                                style={{
                                    background: "rgba(255,255,255,0.06)",
                                    boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.3), inset -1px -1px 3px rgba(255,255,255,0.15)"
                                }}
                            >
                                <Icon weight="duotone" className="w-6 h-6 sm:w-7 sm:h-7 text-[#f8fafc] drop-shadow-md" />
                            </div>

                            <span className="font-bold uppercase tracking-wider text-[9px] sm:text-[10px] leading-[1.2] text-[#f8fafc] w-full px-1 break-words">
                                {item.label}
                            </span>

                            {showBadge && (
                                <div className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[22px] h-[22px] px-1 bg-[#e74c3c] rounded-full border-[2.5px] border-[#1e2329] shadow-sm z-10">
                                    <span className="text-white text-[10px] font-bold leading-none">{counts.usoInterno}</span>
                                </div>
                            )}
                        </motion.button>
                    )
                })}

                {filteredItems.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                        Nenhum item disponível.
                    </div>
                )}
            </div>
        </div>
    )
}
