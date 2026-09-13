/**
 * Domínio público da vitrine (landing + loja de cliente).
 * O CRM permanece em VITE_CRM_PUBLIC_URL (ex.: www.douradosap.com.br).
 * A loja (/loja, /p/*, checkout, etc.) deve ser acessada só neste host; no domínio do CRM redireciona para VITE_STORE_PUBLIC_URL.
 */
const AUTOPECAS_DOMAINS = [
    "autopecasdourados.com.br",
    "www.autopecasdourados.com.br",
]

export function isAutopecasPublicSiteHost(hostname: string): boolean {
    if (!hostname) return false
    const h = hostname.toLowerCase().trim().split(":")[0]
    return AUTOPECAS_DOMAINS.some(d => h === d || h.endsWith("." + d))
}

/** Origem do CRM (login e rotas internas). Sem barra final. */
export function getCrmPublicOrigin(): string {
    const raw = (import.meta.env.VITE_CRM_PUBLIC_URL as string | undefined)?.trim()
    if (raw) return raw.replace(/\/$/, "")
    return "https://www.douradosap.com.br"
}

/** Origem canônica da loja pública (sem /loja no path). Sem barra final. */
export function getStorePublicOrigin(): string {
    const raw = (import.meta.env.VITE_STORE_PUBLIC_URL as string | undefined)?.trim()
    if (raw) return raw.replace(/\/$/, "")
    return "https://www.autopecasdourados.com.br"
}
