import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { Home, ShoppingBag, Package, MessageSquare, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"

export function MobileBottomNav() {
  const location = useLocation()
  const { toggleSidebar } = useUIStore()

  const navigate = useNavigate()

  // Hide the bottom nav in full screen pages, checkout, etc.
  const isMobileMenu = location.pathname.startsWith('/menu') || location.pathname === '/'
  const isFullScreen = !isMobileMenu; // Could be extended based on location
  const isNoPaddingPage = location.pathname.startsWith('/atendimento')

  if (isFullScreen) return null

  const navItems = [
    { icon: Home, label: "Início", to: "/" },
    { icon: ShoppingBag, label: "Vendas", to: "/vendas" },
    { icon: Package, label: "Produtos", to: "/produtos" },
  ]

  return (
    <div className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]", // respects iOS home indicator
        "bg-card/80 backdrop-blur-xl border-t border-border/40",
        "flex items-center justify-around px-2 py-2 shadow-[0_-4px_24px_rgba(0,0,0,0.1)]",
        "transition-transform duration-300 ease-in-out"
    )}>
      {navItems.map((item) => {
        const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
        const Icon = item.icon
        
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1",
              "transition-colors duration-200",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-xl transition-all duration-300",
              isActive ? "bg-primary/10 scale-110" : ""
            )}>
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className={cn(
                "text-[10px] font-medium tracking-tight",
                isActive ? "font-semibold" : ""
            )}>
                {item.label}
            </span>
          </NavLink>
        )
      })}
      
      {/* Menu Button to trigger sidebar */}
      <button
        onClick={() => navigate('/menu')}
        className={cn(
          "flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1",
          "text-muted-foreground hover:text-foreground transition-colors duration-200"
        )}
      >
        <div className="p-1.5 rounded-xl transition-all duration-300">
          <Menu className="w-5 h-5" strokeWidth={2} />
        </div>
        <span className="text-[10px] font-medium tracking-tight">Menu</span>
      </button>
    </div>
  )
}
