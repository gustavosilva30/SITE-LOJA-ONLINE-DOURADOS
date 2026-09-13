import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { getCrmPublicOrigin } from "@/lib/publicSiteHost"

/**
 * Redireciona para o mesmo path (pathname + search + hash) no domínio do CRM.
 * Se `path` for passado, usa esse path absoluto (ex.: "/login").
 */
export function RedirectToCrm({ path }: { path?: string }) {
    useEffect(() => {
        const base = getCrmPublicOrigin()
        const suffix = path ?? `${window.location.pathname}${window.location.search}${window.location.hash}`
        const normalized = suffix.startsWith("/") ? suffix : `/${suffix}`
        window.location.replace(`${base}${normalized}`)
    }, [path])

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">A redirecionar para o sistema…</p>
        </div>
    )
}
