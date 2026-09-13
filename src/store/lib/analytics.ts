import { getApiBaseUrl } from '@/lib/apiBase'

/**
 * Analytics próprio (first-party) da loja — page views + cliques.
 * Nunca lança exceção pro chamador: tracking não pode quebrar a UI.
 *
 * visitor_id: UUID permanente por navegador (localStorage).
 * session_id: UUID por "visita" — expira depois de 30min sem atividade.
 */

const VISITOR_KEY = 'dourados_visitor_id'
const SESSION_KEY = 'dourados_session_id'
const SESSION_LAST_ACTIVITY_KEY = 'dourados_session_last_activity'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

function uuid(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

export function hasAnalyticsConsent(): boolean {
    try {
        if (typeof window === 'undefined') return false
        return localStorage.getItem('dourados_cookie_analytics') === 'accepted'
    } catch {
        return false
    }
}

function getVisitorId(): string {
    try {
        if (!hasAnalyticsConsent()) {
            return 'no-consent'
        }
        let id = localStorage.getItem(VISITOR_KEY)
        if (!id) {
            id = uuid()
            localStorage.setItem(VISITOR_KEY, id)
        }
        return id
    } catch {
        return 'no-storage'
    }
}

function getSessionId(): string {
    try {
        const now = Date.now()
        const lastActivity = Number(sessionStorage.getItem(SESSION_LAST_ACTIVITY_KEY) || 0)
        let id = sessionStorage.getItem(SESSION_KEY)
        if (!id || now - lastActivity > SESSION_TIMEOUT_MS) {
            id = uuid()
            sessionStorage.setItem(SESSION_KEY, id)
            sessionStorage.setItem('dourados_session_is_new', '1')
        }
        sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now))
        return id
    } catch {
        return 'no-storage'
    }
}

function getCustomerId(): string | null {
    try {
        const raw = localStorage.getItem('store_customer')
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed?.id || null
    } catch {
        return null
    }
}

function getReferrerIfNewSession(): string | undefined {
    try {
        if (sessionStorage.getItem('dourados_session_is_new') === '1') {
            sessionStorage.removeItem('dourados_session_is_new')
            return document.referrer || undefined
        }
    } catch {
        // ignore
    }
    return undefined
}

export function isStorePublicPath(pathname: string): boolean {
    if (!pathname) return false
    const path = pathname.toLowerCase().split('?')[0].split('#')[0]
    if (
        path === '/' ||
        path === '/checkout' ||
        path === '/checkout/pagamento' ||
        path === '/meus-pedidos' ||
        path === '/contato' ||
        path === '/institucional' ||
        path === '/sucatas' ||
        path === '/site' ||
        path === '/terms' ||
        path === '/privacy' ||
        path === '/deletion'
    ) {
        return true
    }
    if (
        path.startsWith('/categoria/') ||
        path.startsWith('/p/') ||
        path.startsWith('/sucatas/') ||
        path.startsWith('/pedido/') ||
        path.startsWith('/legal/')
    ) {
        return true
    }
    return false
}

type EventType = 'pageview' | 'click'

export function track(eventType: EventType, eventName?: string, eventData?: Record<string, unknown>) {
    try {
        // Validação LGPD: analytics só é transmitido com consentimento prévio e explícito do titular
        if (!hasAnalyticsConsent()) {
            return
        }

        const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
        if (eventType === 'pageview' && !isStorePublicPath(pathname)) {
            return
        }

        const payload = {
            visitor_id: getVisitorId(),
            session_id: getSessionId(),
            event_type: eventType,
            event_name: eventName,
            page_path: window.location.pathname,
            event_data: eventData,
            referrer: getReferrerIfNewSession(),
        }
        const url = `${getApiBaseUrl()}/api/store/track`
        const body = JSON.stringify(payload)

        if (navigator.sendBeacon) {
            // Blob 'text/plain' evita preflight de CORS (application/json não é um
            // content-type "simple request").
            const blob = new Blob([body], { type: 'text/plain' })
            const sent = navigator.sendBeacon(url, blob)
            if (sent) return
        }
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body,
            keepalive: true,
        }).catch(() => { })
    } catch {
        // tracking nunca pode quebrar a UI
    }
}
