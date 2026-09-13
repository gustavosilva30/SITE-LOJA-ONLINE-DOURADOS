import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuthStore } from "@/store/authStore"
import { hasCrmPathAccess } from "@/config/crmRoutePermissions"

/**
 * Rotas dentro do Layout CRM que não passam pela allowlist (páginas de erro / ajuda).
 * /menu e /menu/* são páginas de navegação mobile — elas já fazem sua própria
 * filtragem de itens por permissão, portanto não precisam ser bloqueadas aqui.
 */
const BYPASS_PATHS = new Set(["/sem-permissao"])

export function CrmAccessGuard({ children }: { children?: React.ReactNode }) {
  const location = useLocation()
  const { atendente, initialized } = useAuthStore()
  const path = location.pathname.split("?")[0] || "/"

  if (!initialized) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
        Carregando…
      </div>
    )
  }

  if (!atendente) {
    return <Navigate to="/login" replace />
  }

  // Páginas de navegação mobile: o próprio componente filtra os cards por permissão.
  if (path === "/menu" || path.startsWith("/menu/")) {
    return children ? <>{children}</> : <Outlet />
  }

  if (BYPASS_PATHS.has(path)) {
    return children ? <>{children}</> : <Outlet />
  }

  if (hasCrmPathAccess(path, atendente)) {
    return children ? <>{children}</> : <Outlet />
  }

  return <Navigate to="/sem-permissao" replace />
}
