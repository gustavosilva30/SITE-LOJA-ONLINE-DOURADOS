/**
 * Polling centralizado do painel: 4 endpoints em sequência, intervalo mínimo 30s,
 * pausa com aba em background, deduplicação por endpoint e backoff exponencial em 5xx/timeout.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { dashboardApi, mercadolivreApi, recadosApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type {
    NotificationsPreviewPainel,
    RecadoPainelRow,
    SidebarCountsPainel,
} from '@/context/painelPollingTypes'
import { hasCrmPathAccess } from '@/config/crmRoutePermissions'
import { getAuthToken } from '@/lib/auth'

export const DASHBOARD_POLL_MIN_CYCLE_MS = 60_000
const DASHBOARD_POLL_MAX_BACKOFF_MS = 5 * 60_000
const STAGGER = { notifications: 0, sidebar: 2000, recados: 4000, ml: 6000 }
const FIRST_FULL_CYCLE_MS = 30_000

type InFlight = {
    notifications: boolean
    sidebar: boolean
    recados: boolean
    ml: boolean
}

function isBackoffError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    if (msg.includes('http 500') || msg.includes('http 502') || msg.includes('http 503') || msg.includes('http 504'))
        return true
    if (msg.includes('timeout') || msg.includes('tempo limite') || msg.includes('excedeu') || msg.includes('gateway')) return true
    return false
}

let globalLoopTimer: number | undefined = undefined
let globalFirstCycleTimer: number | undefined = undefined
let globalStaggerTimers: number[] = []
let globalCycleBackoff = DASHBOARD_POLL_MIN_CYCLE_MS
let isPollingInitialized = false

export function useDashboardPolling() {
    const { initialized } = useAuthStore()
    const [recadosNaoLidos, setRecadosNaoLidos] = useState<RecadoPainelRow[]>([])
    const [notificationsPreview, setNotificationsPreview] = useState<NotificationsPreviewPainel | null>(null)
    const [mlQuestions, setMlQuestions] = useState<Array<Record<string, unknown>>>([])
    const [mlSales, setMlSales] = useState<Array<Record<string, unknown>>>([])
    const [mlMessages, setMlMessages] = useState<Array<Record<string, unknown>>>([])
    const [sidebarCounts, setSidebarCounts] = useState<SidebarCountsPainel>({
        lembretes: 0,
        entregas: 0,
        carrinho: 0,
        recados: 0,
        uso_interno: 0,
    })
    const [pollIntervalMs, setPollIntervalMs] = useState(DASHBOARD_POLL_MIN_CYCLE_MS)

    const inFlightRef = useRef<InFlight>({
        notifications: false,
        sidebar: false,
        recados: false,
        ml: false,
    })

    const loadNotifications = useCallback(async (): Promise<boolean> => {
        if (!getAuthToken()) return false
        if (inFlightRef.current.notifications) return false
        inFlightRef.current.notifications = true
        let backoff = false
        try {
            const data = (await dashboardApi.notificationsPreview()) as NotificationsPreviewPainel
            setNotificationsPreview(data)
        } catch (e) {
            if (isBackoffError(e)) backoff = true
        } finally {
            inFlightRef.current.notifications = false
        }
        return backoff
    }, [])

    const loadSidebar = useCallback(async (): Promise<boolean> => {
        if (!getAuthToken()) return false
        if (inFlightRef.current.sidebar) return false
        inFlightRef.current.sidebar = true
        let backoff = false
        try {
            const d = await dashboardApi.sidebarCounts()
            setSidebarCounts({
                lembretes: d.lembretes,
                entregas: d.entregas,
                carrinho: d.carrinho,
                recados: d.recados,
                uso_interno: d.uso_interno,
            })
        } catch (e) {
            if (isBackoffError(e)) backoff = true
        } finally {
            inFlightRef.current.sidebar = false
        }
        return backoff
    }, [])

    const loadRecados = useCallback(async (): Promise<boolean> => {
        if (!getAuthToken()) return false
        if (inFlightRef.current.recados) return false
        inFlightRef.current.recados = true
        let backoff = false
        try {
            const rows = ((await recadosApi.naoLidos()) || []) as RecadoPainelRow[]
            setRecadosNaoLidos(
                rows.map((r) => ({
                    ...r,
                    remetente_nome: r.remetente_nome ?? undefined,
                }))
            )
        } catch (e) {
            if (isBackoffError(e)) backoff = true
        } finally {
            inFlightRef.current.recados = false
        }
        return backoff
    }, [])

    const loadMl = useCallback(async (): Promise<boolean> => {
        const { atendente } = useAuthStore.getState()
        if (!atendente) return false
        if (!getAuthToken()) return false
        if (inFlightRef.current.ml) return false
        inFlightRef.current.ml = true
        let backoff = false
        try {
            const v = (await mercadolivreApi.alertsPending()) as {
                questions?: unknown[]
                sales?: unknown[]
                messages?: unknown[]
            }
            setMlQuestions((v.questions || []) as Array<Record<string, unknown>>)
            setMlSales((v.sales || []) as Array<Record<string, unknown>>)
            setMlMessages((v.messages || []) as Array<Record<string, unknown>>)
        } catch (e) {
            if (isBackoffError(e)) backoff = true
        } finally {
            inFlightRef.current.ml = false
        }
        return backoff
    }, [])

    const runSequentialCycle = useCallback(async () => {
        if (!getAuthToken()) return
        if (document.visibilityState === 'hidden') return

        let anyBackoff = false
        if (await loadNotifications()) anyBackoff = true
        if (await loadSidebar()) anyBackoff = true
        if (await loadRecados()) anyBackoff = true
        if (await loadMl()) anyBackoff = true

        if (anyBackoff) {
            globalCycleBackoff = Math.min(globalCycleBackoff * 2, DASHBOARD_POLL_MAX_BACKOFF_MS)
        } else {
            globalCycleBackoff = DASHBOARD_POLL_MIN_CYCLE_MS
        }
        setPollIntervalMs(globalCycleBackoff)
    }, [loadMl, loadNotifications, loadRecados, loadSidebar])

    const scheduleAfterCycle = useCallback(() => {
        if (globalLoopTimer !== undefined) {
            clearTimeout(globalLoopTimer)
            globalLoopTimer = undefined
        }
        if (document.visibilityState === 'hidden') return

        const delay = globalCycleBackoff
        globalLoopTimer = window.setTimeout(() => {
            globalLoopTimer = undefined
            if (document.visibilityState === 'hidden') return
            void runSequentialCycle().then(() => {
                scheduleAfterCycle()
            })
        }, delay)
    }, [runSequentialCycle])

    /** Inicia o polling (uma única vez por carga da página para evitar duplicatas em strict mode) */
    useEffect(() => {
        if (!initialized) return
        if (isPollingInitialized) return
        isPollingInitialized = true

        globalStaggerTimers = [
            window.setTimeout(() => void loadNotifications(), STAGGER.notifications),
            window.setTimeout(() => void loadSidebar(), STAGGER.sidebar),
            window.setTimeout(() => void loadRecados(), STAGGER.recados),
            window.setTimeout(() => void loadMl(), STAGGER.ml),
        ]

        if (globalFirstCycleTimer !== undefined) clearTimeout(globalFirstCycleTimer)
        globalFirstCycleTimer = window.setTimeout(() => {
            globalFirstCycleTimer = undefined
            if (document.visibilityState === 'hidden') return
            void runSequentialCycle().then(() => scheduleAfterCycle())
        }, FIRST_FULL_CYCLE_MS)

        return () => {
            // Em dev (React Strict Mode), vamos limpar os timers para não duplicar, 
            // mas isPollingInitialized previne recriação. 
            // Descomente se quiser desmontar de fato no root unmount.
        }
    }, [initialized, loadMl, loadNotifications, loadRecados, loadSidebar, runSequentialCycle, scheduleAfterCycle])

    /** Pausa com aba oculta; retoma o agendamento ao voltar. */
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'hidden') {
                if (globalLoopTimer !== undefined) {
                    clearTimeout(globalLoopTimer)
                    globalLoopTimer = undefined
                }
            } else {
                scheduleAfterCycle()
            }
        }
        document.addEventListener('visibilitychange', onVis)
        return () => document.removeEventListener('visibilitychange', onVis)
    }, [scheduleAfterCycle])

    const refreshPainel = useCallback(() => {
        void runSequentialCycle()
    }, [runSequentialCycle])

    return {
        recadosNaoLidos,
        notificationsPreview,
        mlQuestions,
        mlSales,
        mlMessages,
        sidebarCounts,
        refreshPainel,
        pollIntervalMs,
    }
}
