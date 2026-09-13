/**
 * CRM em https://www... não pode chamar API em http://api... (mixed content).
 * Este patch corre ANTES de qualquer outro módulo usar fetch (import "./polyfills" é o 1.º em main.tsx).
 */
function installHttpsApiFetchGuard(): void {
    if (typeof window === "undefined" || typeof fetch !== "function") return
    if (window.location.protocol !== "https:") return
    const w = window as Window & { __crmHttpsFetchPatched?: boolean }
    if (w.__crmHttpsFetchPatched) return
    w.__crmHttpsFetchPatched = true

    const originalFetch = window.fetch.bind(window)

    function isLocalhost(hostname: string): boolean {
        const h = hostname.toLowerCase()
        return h === "localhost" || h === "127.0.0.1" || h.startsWith("127.")
    }

    /** Qualquer http:// para host público → https:// (evita mixed content se VITE_API_URL veio com http no build). */
    function normalizeUrl(input: string): string {
        try {
            const parsed = new URL(input, window.location.origin)
            if (parsed.protocol === "http:" && !isLocalhost(parsed.hostname)) {
                parsed.protocol = "https:"
                return parsed.toString()
            }
        } catch {
            /* ignore */
        }
        return input
    }

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof input === "string") {
            return originalFetch(normalizeUrl(input), init)
        }
        if (input instanceof URL) {
            return originalFetch(new URL(normalizeUrl(input.toString())), init)
        }
        if (input instanceof Request) {
            const nextUrl = normalizeUrl(input.url)
            if (nextUrl !== input.url) {
                return originalFetch(new Request(nextUrl, input), init)
            }
            return originalFetch(input, init)
        }
        return originalFetch(input, init)
    }
}

installHttpsApiFetchGuard()

declare global {
    interface Map<K, V> {
        /**
         * Some third-party bundles expect this helper to exist on Map.
         * It returns an existing value for `key` or computes/inserts it.
         */
        getOrInsertComputed?: (key: K, compute: ((key: K) => V) | (() => V)) => V
    }
}

export {}

if (typeof Map !== "undefined" && typeof Map.prototype.getOrInsertComputed !== "function") {
    // eslint-disable-next-line no-extend-native
    Map.prototype.getOrInsertComputed = function <K, V>(
        this: Map<K, V>,
        key: K,
        compute: ((key: K) => V) | (() => V)
    ): V {
        const existing = this.get(key)
        if (existing !== undefined || this.has(key)) return existing as V

        const value = (compute as (k: K) => V).length >= 1 ? (compute as (k: K) => V)(key) : (compute as () => V)()
        this.set(key, value)
        return value
    }
}

