import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { getApiBaseUrl } from '@/lib/apiBase'
import { useAuthStore } from '@/store/authStore'
import { DASHBOARD_POLL_MIN_CYCLE_MS, useDashboardPolling } from '@/hooks/useDashboardPolling'
import type { NotificationsPreviewPainel, RecadoPainelRow, SidebarCountsPainel } from './painelPollingTypes'
import { getAuthToken } from '@/lib/auth'

/** Intervalo mínimo entre ciclos completos de polling do painel (ms). Reexport do hook. */
export const PAINEL_POLL_INTERVAL_MS = DASHBOARD_POLL_MIN_CYCLE_MS

/** Sync de perguntas e vendas com a API do ML (ms). */
export const PAINEL_ML_SYNC_INTERVAL_MS = 1_200_000

export type { RecadoPainelRow, NotificationsPreviewPainel, SidebarCountsPainel } from './painelPollingTypes'

export type PainelPollingContextValue = {
    recadosNaoLidos: RecadoPainelRow[]
    notificationsPreview: NotificationsPreviewPainel | null
    mlQuestions: Array<Record<string, unknown>>
    mlSales: Array<Record<string, unknown>>
    mlMessages: Array<Record<string, unknown>>
    sidebarCounts: SidebarCountsPainel
    refreshPainel: () => void
    pollIntervalMs: number
}

const PainelPollingContext = createContext<PainelPollingContextValue | null>(null)

export function PainelPollingProvider({ children }: { children: ReactNode }) {
    const { initialized, atendente } = useAuthStore()
    const {
        recadosNaoLidos,
        notificationsPreview,
        mlQuestions,
        mlSales,
        mlMessages,
        sidebarCounts,
        refreshPainel,
        pollIntervalMs,
    } = useDashboardPolling()

    const syncMlData = useCallback(async () => {
        try {
            const token = getAuthToken()
            if (!token) return
            const api = getApiBaseUrl()
            
            // Sincroniza perguntas
            void fetch(`${api}/api/mercadolivre/questions/sync-open`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {})

            // Sincroniza vendas (pedidos)
            void fetch(`${api}/api/mercadolivre/sync-orders`, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ days: 1 })
            }).catch(() => {})
            
        } catch {
            /* rede */
        }
    }, [])

    useEffect(() => {
        if (!initialized || !atendente?.id) return
        // Delay na primeira execução para não sobrecarregar o login
        const firstRun = window.setTimeout(() => {
            void syncMlData()
        }, 15_000)
        const id = window.setInterval(
            () => void syncMlData(),
            PAINEL_ML_SYNC_INTERVAL_MS
        )
        return () => {
            window.clearTimeout(firstRun)
            window.clearInterval(id)
        }
    }, [initialized, atendente?.id, syncMlData])

    const value = useMemo<PainelPollingContextValue>(
        () => ({
            recadosNaoLidos,
            notificationsPreview,
            mlQuestions,
            mlSales,
            mlMessages,
            sidebarCounts,
            refreshPainel,
            pollIntervalMs,
        }),
        [
            recadosNaoLidos,
            notificationsPreview,
            mlQuestions,
            mlSales,
            mlMessages,
            sidebarCounts,
            refreshPainel,
            pollIntervalMs,
        ]
    )

    return <PainelPollingContext.Provider value={value}>{children}</PainelPollingContext.Provider>
}

export function usePainelPolling(): PainelPollingContextValue {
    const ctx = useContext(PainelPollingContext)
    if (!ctx) {
        throw new Error('usePainelPolling deve estar dentro de PainelPollingProvider')
    }
    return ctx
}
