import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { getStorePublicOrigin } from "@/lib/publicSiteHost"

/**
 * Redireciona para o mesmo path no domínio da loja (autopecasdourados).
 * Usado quando o visitante abre /loja, /p/*, checkout etc. no host do CRM.
 */
export function RedirectToStore() {
    useEffect(() => {
        const base = getStorePublicOrigin()
        const suffix = `${window.location.pathname}${window.location.search}${window.location.hash}`
        window.location.replace(`${base}${suffix}`)
    }, [])

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">A redirecionar para a loja…</p>
        </div>
    )
}
