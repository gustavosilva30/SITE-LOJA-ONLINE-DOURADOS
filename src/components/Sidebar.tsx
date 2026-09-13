import { Link, useLocation, useNavigate } from "react-router-dom"
import type { AtendenteAuth } from "@/store/authStore"
import {
  Package,
  CurrencyDollar,
  Gear,
  SignOut,
  Bell,
  ChatCircle,
  MagnifyingGlass,
  SidebarSimple,
  CaretDown,
  Folder,
  Globe,
  Books,
  PaintBrush,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { prefetchRoute } from "@/lib/prefetchRoute"
import { ModeToggle } from "./ModeToggle"
import { useState, useEffect, useMemo, type ComponentType } from "react"
import { useAuthStore } from "@/store/authStore"
import { useUIStore } from "@/store/uiStore"
import {
  CRM_NAV_ITEMS,
  type CrmNavItemDef,
  hasCrmPathAccess,
  isManagerAtendente,
  sortNavByHrefOrder,
  SIDEBAR_CADASTROS_HREF_ORDER,
  SIDEBAR_FINANCEIRO_HREF_ORDER,
  SIDEBAR_LOGISTICA_HREF_ORDER,
  SIDEBAR_ADMIN_HREF_ORDER,
  SIDEBAR_ONLINE_HREF_ORDER,
} from "@/config/crmRoutePermissions"
import { usePainelPolling } from "@/context/PainelPollingContext"
import { Truck } from "@phosphor-icons/react"

type NavItemDef = {
  icon: ComponentType<{ className?: string; weight?: string }>
  label: string
  href: string
  colorClass?: string
}

function useFilteredNav(items: CrmNavItemDef[], atendente: AtendenteAuth | null) {
  return useMemo(() => {
    if (!atendente) return []
    return items.filter((item) => {
      if (item.href === "/admin/marketing" && !isManagerAtendente(atendente)) return false
      return hasCrmPathAccess(item.href, atendente)
    })
  }, [items, atendente])
}

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarCounts } = usePainelPolling()
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
  const [openCadastros, setOpenCadastros] = useState(false)
  const [openFinanceiro, setOpenFinanceiro] = useState(false)
  const [openLogistica, setOpenLogistica] = useState(false)
  const [openAdmin, setOpenAdmin] = useState(false)
  const [openOnline, setOpenOnline] = useState(false)
  const { atendente, signOut } = useAuthStore()
  const { toggleSidebar, setSidebarOpen, setImageEditorOpen } = useUIStore()

  const sidebarPool = useMemo(() => CRM_NAV_ITEMS.filter((i) => i.navGroup !== "extra"), [])

  const principalPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "principal"), [sidebarPool])
  const cadastrosPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "cadastros"), [sidebarPool])
  const financeiroPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "financeiro"), [sidebarPool])
  const logisticaPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "logistica"), [sidebarPool])
  const adminPool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "administracao"), [sidebarPool])
  const onlinePool = useMemo(() => sidebarPool.filter((i) => i.navGroup === "online"), [sidebarPool])

  const cadastrosSorted = useMemo(
    () => sortNavByHrefOrder(cadastrosPool, SIDEBAR_CADASTROS_HREF_ORDER),
    [cadastrosPool]
  )
  const financeiroSorted = useMemo(
    () => sortNavByHrefOrder(financeiroPool, SIDEBAR_FINANCEIRO_HREF_ORDER),
    [financeiroPool]
  )
  const logisticaSorted = useMemo(
    () => sortNavByHrefOrder(logisticaPool, SIDEBAR_LOGISTICA_HREF_ORDER),
    [logisticaPool]
  )
  const adminSorted = useMemo(() => sortNavByHrefOrder(adminPool, SIDEBAR_ADMIN_HREF_ORDER), [adminPool])
  const onlineSorted = useMemo(() => sortNavByHrefOrder(onlinePool, SIDEBAR_ONLINE_HREF_ORDER), [onlinePool])

  const filteredPrincipal = useFilteredNav(principalPool, atendente)
  const filteredCadastros = useFilteredNav(cadastrosSorted, atendente)
  const filteredFinanceiro = useFilteredNav(financeiroSorted, atendente)
  const filteredLogistica = useFilteredNav(logisticaSorted, atendente)
  const filteredAdmin = useFilteredNav(adminSorted, atendente)
  const filteredOnline = useFilteredNav(onlineSorted, atendente)

  const showConfigLink = atendente && hasCrmPathAccess("/configuracoes", atendente)

  const handleNavClick = () => {
    if (window.innerWidth < 768) setSidebarOpen(false)
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = "/login"
  }

  const pathWithoutSearch = location.pathname
  const currentUrl = `${location.pathname}${location.search}`

  const isItemActive = (item: NavItemDef) =>
    currentUrl === item.href ||
    (item.href !== "/" &&
      !item.href.includes("?") &&
      (pathWithoutSearch === item.href || pathWithoutSearch.startsWith(`${item.href}/`)))

  useEffect(() => {
    const path = location.pathname
    const cur = `${location.pathname}${location.search}`
    const routeMatches = (item: NavItemDef) =>
      cur === item.href ||
      (item.href !== "/" && !item.href.includes("?") && (path === item.href || path.startsWith(`${item.href}/`)))
    if (filteredCadastros.some((i) => routeMatches(i))) setOpenCadastros(true)
    if (filteredFinanceiro.some((i) => routeMatches(i))) setOpenFinanceiro(true)
    if (filteredLogistica.some((i) => routeMatches(i))) setOpenLogistica(true)
    if (filteredAdmin.some((i) => routeMatches(i))) setOpenAdmin(true)
    if (filteredOnline.some((i) => routeMatches(i))) setOpenOnline(true)
  }, [location.pathname, location.search, filteredCadastros, filteredFinanceiro, filteredLogistica, filteredAdmin, filteredOnline])

  const renderNavLink = (item: NavItemDef) => {
    const isActive = isItemActive(item)
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={handleNavClick}
        onMouseEnter={() => prefetchRoute(item.href)}
        onFocus={() => prefetchRoute(item.href)}
        className={cn(
          "group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          isActive
            ? "bg-primary text-white shadow-sm border-l-2 border-accent"
            : "text-foreground hover:bg-muted hover:-translate-y-[1px] hover:shadow-sm"
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <item.icon weight="duotone" className={cn("w-5 h-5 shrink-0 transition-colors", isActive ? "text-white" : item.colorClass || "text-slate-500 group-hover:text-slate-600")} />
          <span className="truncate">{item.label}</span>
        </div>

        {((item.label === "Lembretes" && counts.lembretes > 0) ||
          (item.label === "Entregas" && counts.entregas > 0) ||
          (item.label === "Recados" && counts.recados > 0)) && (
          <div className="flex items-center gap-1 animate-pulse shrink-0">
            <Bell weight="fill" className="w-3 h-3 text-rose-500" />
            <span className="text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500">
              {item.label === "Lembretes" ? counts.lembretes : item.label === "Entregas" ? counts.entregas : counts.recados}
            </span>
          </div>
        )}
      </Link>
    )
  }

  const renderSubNavLink = (item: NavItemDef) => {
    const isActive = isItemActive(item)
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={handleNavClick}
        onMouseEnter={() => prefetchRoute(item.href)}
        onFocus={() => prefetchRoute(item.href)}
        className={cn(
          "group flex items-center justify-between pl-2 pr-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border-l-2 ml-1",
          isActive
            ? "bg-primary text-white border-accent shadow-sm"
            : "text-foreground hover:bg-muted border-transparent hover:border-muted-foreground/30 hover:-translate-y-[1px]"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <item.icon weight="duotone" className={cn("w-4 h-4 shrink-0 transition-colors", isActive ? "text-white" : item.colorClass || "text-slate-500 group-hover:text-slate-600")} />
          <span className="truncate">{item.label}</span>
        </div>
        {item.label === "Uso Interno & Faltas" && counts.usoInterno > 0 && (
          <div className="flex items-center gap-1 animate-pulse shrink-0">
            <Bell weight="fill" className="w-3 h-3 text-rose-500" />
            <span className="text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500">{counts.usoInterno}</span>
          </div>
        )}
      </Link>
    )
  }

  return (
    <aside className="w-64 border-r border-border/60 bg-card/80 backdrop-blur-md flex flex-col h-screen">
      <div className="px-4 py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm border border-border shrink-0">
            <Package weight="duotone" className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-base tracking-tight text-foreground leading-tight">CRM</span>
            <span className="text-[9px] text-muted-foreground font-black uppercase leading-none tracking-wider truncate">
              Dourados Auto Peças
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ModeToggle />
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Fechar menu"
          >
            <SidebarSimple weight="duotone" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
          }}
          className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/70 border border-border/40 rounded-lg text-sm text-muted-foreground transition-all duration-200 group hover:shadow-sm"
        >
          <div className="flex items-center gap-2">
            <MagnifyingGlass weight="duotone" className="w-4 h-4 group-hover:text-primary transition-colors" />
            <span>Buscar...</span>
          </div>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto mt-4 pb-2">
        {filteredPrincipal.map((item) => renderNavLink(item))}

        <button
          type="button"
          onClick={() => {
            setImageEditorOpen(true)
            handleNavClick()
          }}
          className="group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-foreground hover:bg-muted hover:-translate-y-[1px] hover:shadow-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <PaintBrush weight="duotone" className="w-5 h-5 shrink-0 text-purple-500 group-hover:text-purple-600" />
            <span className="truncate">Editor Pro</span>
          </div>
          <div className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[9px] font-black uppercase tracking-wider">Novo</div>
        </button>

        {filteredCadastros.length > 0 && (
          <div className="pt-1 space-y-1">
            <button
              type="button"
              onClick={() => setOpenCadastros((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Books weight="duotone" className="w-5 h-5 shrink-0 text-slate-500" />
                <span className="truncate">Cadastros</span>
              </span>
              <CaretDown
                weight="bold"
                className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", openCadastros && "rotate-180")}
              />
            </button>
            {openCadastros && (
              <div className="space-y-0.5 pt-0.5">{filteredCadastros.map((item) => renderSubNavLink(item))}</div>
            )}
          </div>
        )}

        {filteredFinanceiro.length > 0 && (
          <div className="pt-1 space-y-1">
            <button
              type="button"
              onClick={() => {
                setOpenFinanceiro((o) => !o)
                navigate("/financeiro")
                handleNavClick()
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <CurrencyDollar weight="duotone" className="w-5 h-5 shrink-0 text-emerald-500" />
                <span className="truncate">Financeiro</span>
              </span>
              <CaretDown weight="bold" className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", openFinanceiro && "rotate-180")} />
            </button>
            {openFinanceiro && <div className="space-y-0.5 pt-0.5">{filteredFinanceiro.map((item) => renderSubNavLink(item))}</div>}
          </div>
        )}

        {filteredLogistica.length > 0 && (
          <div className="pt-1 space-y-1">
            <button
              type="button"
              onClick={() => {
                setOpenLogistica((o) => !o)
                navigate("/logistica/dashboard")
                handleNavClick()
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Truck weight="duotone" className="w-5 h-5 shrink-0 text-teal-500" />
                <span className="truncate">Logística</span>
              </span>
              <CaretDown weight="bold" className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", openLogistica && "rotate-180")} />
            </button>
            {openLogistica && <div className="space-y-0.5 pt-0.5">{filteredLogistica.map((item) => renderSubNavLink(item))}</div>}
          </div>
        )}

        {filteredAdmin.length > 0 && (
          <div className="pt-1 space-y-1">
            <button
              type="button"
              onClick={() => setOpenAdmin((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Folder weight="duotone" className="w-5 h-5 shrink-0 text-slate-500" />
                <span className="truncate">Administração</span>
              </span>
              <CaretDown weight="bold" className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", openAdmin && "rotate-180")} />
            </button>
            {openAdmin && <div className="space-y-0.5 pt-0.5">{filteredAdmin.map((item) => renderSubNavLink(item))}</div>}
          </div>
        )}

        {filteredOnline.length > 0 && (
          <div className="pt-1 space-y-1">
            <button
              type="button"
              onClick={() => setOpenOnline((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Globe weight="duotone" className="w-5 h-5 shrink-0 text-slate-500" />
                <span className="truncate">Online</span>
              </span>
              <CaretDown weight="bold" className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", openOnline && "rotate-180")} />
            </button>
            {openOnline && <div className="space-y-0.5 pt-0.5">{filteredOnline.map((item) => renderSubNavLink(item))}</div>}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-border/60 space-y-2 bg-muted/20">
        {showConfigLink && (
          <Link
            to="/configuracoes"
            onClick={handleNavClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Gear weight="duotone" className="w-5 h-5 text-slate-500" />
            Configurações
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <SignOut weight="duotone" className="w-5 h-5" />
          Sair
        </button>
      </div>
    </aside>
  )
}
