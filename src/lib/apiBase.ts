/**
 * URL base do backend FastAPI.
 *
 * Regra de segurança: qualquer URL http:// que não seja localhost é promovida
 * para https:// em TODAS as situações em que o código corre num browser
 * (independentemente do protocolo da página). Isso evita Mixed Content mesmo
 * se VITE_API_URL for definida com http:// por engano no painel do Vercel/Easypanel.
 */

function isLocalhost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0]
  return h === "localhost" || h === "127.0.0.1" || h.startsWith("127.")
}

/** Garante https:// para qualquer host que não seja localhost nem um endereço de IP direto. */
export function ensureHttps(url: string): string {
  const trimmed = (url || "").trim().replace(/\/$/, "")
  if (!trimmed) return trimmed
  // Já é https ou é relativo/sem protocolo
  if (/^https:\/\//i.test(trimmed)) return trimmed
  if (/^http:\/\//i.test(trimmed)) {
    const rest = trimmed.slice(7) // remove "http://"
    const host = rest.split("/")[0].split(":")[0]
    // Não força HTTPS para localhost nem para IPs (v4 ou v6 básicos)
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host) || host.includes(":")
    if (isLocalhost(host) || isIp) return trimmed
    return "https://" + rest
  }
  return trimmed
}

/** @deprecated use ensureHttps — mantido para compatibilidade */
export function ensureApiBaseMatchesPageSecurity(base: string): string {
  return ensureHttps(base)
}

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim()
  let base: string

  if (typeof window !== "undefined" && (window as any).Capacitor) {
    return "https://api.douradosap.com.br"
  }

  if (fromEnv) {
    base = fromEnv.replace(/\/$/, "")
  } else if (typeof window !== "undefined" && import.meta.env.PROD) {
    const { hostname } = window.location
    if (hostname && !isLocalhost(hostname)) {
      const hostNoWww = hostname.replace(/^www\./, "")
      base = `https://api.${hostNoWww}`
    } else {
      base = "http://localhost:5000"
    }
  } else {
    base = "http://localhost:5000"
  }

  // Última defesa: nunca expor http:// para API em produção (build com VITE_API_URL=http://api...)
  return ensureHttps(base)
}
