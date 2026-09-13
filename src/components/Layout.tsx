import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { CommandMenu } from "./CommandMenu"
import { NotificationsCenter } from "./NotificationsCenter"
import { RecadosToaster } from "./RecadosToaster"
import { MercadoLivreAlertsToaster } from "./MercadoLivreAlertsToaster"
import { SystemLogErrorBoundary } from "./SystemLogErrorBoundary"
import { motion } from "framer-motion"
import { useUIStore } from "@/store/uiStore"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { Menu } from "lucide-react"
import { logErro } from "@/lib/systemLog"
import { PainelPollingProvider } from "@/context/PainelPollingContext"
import { ImageEditorModal } from "./ImageEditor/ImageEditorModal"
import { StaticResourcesProvider } from "@/hooks/useStaticResources"
import { StoreOrdersAlert } from "./StoreOrdersAlert"
import { CRM_NAV_ITEMS } from "@/config/crmRoutePermissions"
import { CaretLeft } from "@phosphor-icons/react"

export function Layout() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen, isImageEditorOpen, setImageEditorOpen } = useUIStore()
  const { atendente } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isWidePage = location.pathname.startsWith('/relatorios') || location.pathname.startsWith('/financeiro') || location.pathname.startsWith('/clientes') || location.pathname.startsWith('/produtos/alteracao-massa') || location.pathname.startsWith('/catalogo/alteracao-massa') || location.pathname.startsWith('/banco-veiculos/versoes-massa') || location.pathname.startsWith('/logs') || location.pathname.startsWith('/admin/processar-fotos') || location.pathname.startsWith('/pedidos-compra') || location.pathname.startsWith('/cotacao-frete') || location.pathname.startsWith('/sucatas') || location.pathname.startsWith('/logistica-boletos') || location.pathname.startsWith('/controle-boletos')
  // Páginas que devem ocupar 100% do espaço disponível sem padding nem overflow-y
  const isMobileMenu = location.pathname.startsWith('/menu') || location.pathname === '/'
  const isNoPaddingPage = location.pathname.startsWith('/atendimento') || location.pathname.startsWith('/mercadolivre') || isMobileMenu
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isFullScreen = isMobile && !isMobileMenu

  const handleMobileBack = () => {
    // Encontrar o item do menu atual para determinar seu grupo pai
    const currentItem = CRM_NAV_ITEMS.find(item => item.href === location.pathname || (item.href !== "/" && location.pathname.startsWith(item.href + "/")))
    
    if (currentItem) {
      if (currentItem.navGroup === "principal" || currentItem.navGroup === "extra") {
        navigate("/menu")
      } else {
        navigate(`/menu/${currentItem.navGroup}`)
      }
    } else {
      navigate("/menu")
    }
  }

  useEffect(() => {
    const onWindowError = (e: ErrorEvent) => {
      const msg = e.message || 'Erro no navegador'
      if (!msg || msg === 'Script error.') return
      // Ruído comum do Chrome, não é falha do app
      if (msg.includes('ResizeObserver loop')) return
      logErro(msg, e.error || e, atendente?.id, 'window.error')
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      logErro('Promise não tratada no front-end', e.reason, atendente?.id, 'unhandledrejection')
    }
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [atendente?.id])

  // Fecha sidebar automaticamente em telas pequenas ao navegar
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [location.pathname])

  // Inicia fechada em mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [])

  return (
    <PainelPollingProvider>
    <StaticResourcesProvider />
    <div className="h-screen bg-background text-foreground overflow-hidden flex">
      <div className="no-print">
        <CommandMenu />
        <NotificationsCenter />
        {!isFullScreen && <MercadoLivreAlertsToaster />}
      </div>

      {/* Overlay mobile — clica para fechar */}
      {sidebarOpen && !isFullScreen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden no-print"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — overlay no mobile, push no desktop */}
      <div className={cn(
        "fixed md:relative z-50 md:z-auto h-full transition-all duration-300 ease-in-out shrink-0 no-print",
        sidebarOpen
          ? "translate-x-0 w-64"
          : "-translate-x-full md:translate-x-0 w-64 md:w-0 md:overflow-hidden",
        isFullScreen && "hidden md:block"
      )}>
        <Sidebar />
      </div>

      <main className="flex-1 overflow-hidden relative flex flex-col h-full min-w-0">
        {/* Barra de topo mobile apenas com nome do sistema (hamburguer foi pra bottom bar) */}
        {!isFullScreen && !isMobileMenu && (
          <div className="flex items-center gap-3 pl-4 pr-14 py-3 border-b border-border/60 bg-card/80 backdrop-blur-md md:hidden shrink-0 no-print">
            <span className="font-bold text-sm text-foreground">Dourados Auto Peças</span>
          </div>
        )}

        {/* Header explícito para painéis em tela cheia no mobile */}
        {isFullScreen && (
          <div className="flex items-center justify-between pl-2 pr-14 py-2 border-b border-border/60 bg-card/80 backdrop-blur-md md:hidden shrink-0 no-print sticky top-0 z-40">
            <button
              onClick={handleMobileBack}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted active:bg-muted text-foreground transition-colors"
            >
              <CaretLeft weight="bold" className="w-5 h-5" />
              <span className="font-semibold text-[15px]">Voltar</span>
            </button>
            <span className="font-bold text-[13px] text-muted-foreground truncate flex-1 min-w-0 text-right ml-2">
              {CRM_NAV_ITEMS.find(i => i.href === location.pathname)?.label || "Dourados"}
            </span>
          </div>
        )}

        {/* Alerta flutuante de novos pedidos da loja online (canto superior direito) */}
        {!isFullScreen && (
          <div className="absolute top-3 right-3 z-30 no-print">
            <StoreOrdersAlert />
          </div>
        )}

        {/* Botão flutuante para reabrir sidebar no desktop quando fechada */}
        {!sidebarOpen && !isFullScreen && (
          <button
            onClick={toggleSidebar}
            className="hidden md:flex absolute top-4 left-4 z-30 items-center gap-2 px-3 py-2 rounded-lg bg-card/80 backdrop-blur-sm border border-border/60 shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:bg-muted transition-all text-xs font-bold text-muted-foreground hover:text-foreground hover:-translate-y-[1px] no-print"
            title="Abrir menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: isNoPaddingPage ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: isNoPaddingPage ? 0.15 : 0.3 }}
          className={cn(
            "flex-1 transition-all duration-300 h-full mx-auto w-full min-w-0 md:pb-0 pb-0",
            isNoPaddingPage ? cn("p-0 max-w-none", !isMobileMenu && "overflow-hidden") :
            isWidePage ? "p-4 md:p-6 max-w-none" :
                "p-4 md:p-6 max-w-7xl"
          )}
        >
          <div className={cn(
            "h-full",
            (isNoPaddingPage && !isMobileMenu) ? "overflow-hidden" : "overflow-y-auto custom-scrollbar"
          )}>
            <SystemLogErrorBoundary atendenteId={atendente?.id}>
              <Outlet />
            </SystemLogErrorBoundary>
          </div>
        </motion.div>
      </main>
      <div className="no-print">
        <RecadosToaster />
        <ImageEditorModal
          isOpen={isImageEditorOpen}
          onClose={() => setImageEditorOpen(false)}
        />
      </div>
    </div>
    </PainelPollingProvider>
  )
}
