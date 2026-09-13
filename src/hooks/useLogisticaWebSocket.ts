/**
 * useLogisticaWebSocket.ts
 * 
 * Hook para conexão ao WebSocket exclusivo de logística.
 * Segue o mesmo padrão dos outros hooks de WS do CRM.
 * 
 * Eventos suportados:
 *   gps_update           → posição GPS de motorista atualizada
 *   motorista_online     → motorista iniciou sessão
 *   motorista_offline    → motorista encerrou sessão
 *   geofence_alert       → chegando (100m) ou chegou (30m)
 *   status_change        → mudança de status de entrega
 *   entrega_confirmada   → entrega concluída
 *   motoristas_ativos_snapshot → snapshot inicial ao conectar
 */
import { useEffect, useRef, useCallback } from 'react'
import { getApiBaseUrl } from '@/lib/apiBase'
import { getAuthToken } from '@/lib/auth'

export type LogisticaEvent =
  | { type: 'gps_update'; motorista_id: string; lat: number; lon: number; velocidade?: number; heading?: number; bateria?: number; updated_at: string; parado?: boolean; mocked?: boolean }
  | { type: 'motorista_online'; motorista_id: string; nome?: string }
  | { type: 'motorista_offline'; motorista_id: string; motivo?: string }
  | { type: 'motorista_sem_sinal'; motorista_id: string; segundos_desde_ultimo_sinal: number }
  | { type: 'motorista_sinal_recuperado'; motorista_id: string }
  | { type: 'geofence_alert'; entrega_id: string; tipo: 'chegando' | 'chegou'; motorista_id: string }
  | { type: 'status_change'; entrega_id: string; tipo_evento: string; motorista_id?: string }
  | { type: 'entrega_confirmada'; entrega_id: string; motorista_id: string; nome_recebedor: string }
  | { type: 'motoristas_ativos_snapshot'; motorista_ids: string[] }
  | { type: 'pong' }

type EventHandler = (event: LogisticaEvent) => void

interface UseLogisticaWebSocketOptions {
  onEvent?: EventHandler
  enabled?: boolean
}

/**
 * Resolve URL do WebSocket de logística a partir da URL da API.
 * https://api.douradosap.com.br → wss://api.douradosap.com.br/ws/logistica
 */
function buildWsUrl(token: string): string {
  const apiBase = getApiBaseUrl()
  const wsBase = apiBase
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace(/\/$/, '')
  return `${wsBase}/ws/logistica?token=${encodeURIComponent(token)}`
}

export function useLogisticaWebSocket({ onEvent, enabled = true }: UseLogisticaWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef<number>(0)
  const onEventRef = useRef(onEvent)
  const mountedRef = useRef(true)

  // Mantém referência atualizada do handler sem reconectar
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    const token = getAuthToken()
    if (!token) return

    // Fecha conexão anterior se existir
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close()
    }

    try {
      const url = buildWsUrl(token)
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        // Keep-alive: envia ping a cada 25s
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          } else {
            clearInterval(pingInterval)
          }
        }, 25_000)
        ;(ws as any)._pingInterval = pingInterval
      }

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as LogisticaEvent
          onEventRef.current?.(data)
        } catch {
          // ignora mensagens malformadas
        }
      }

      ws.onclose = () => {
        if ((ws as any)._pingInterval) clearInterval((ws as any)._pingInterval)
        if (!mountedRef.current || !enabled) return
        
        // Exponential backoff reconnect: initial delay 1s, backoff factor 2, max 30s, jitter +-20%
        const attempts = reconnectAttemptsRef.current
        const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempts))
        const jitter = (Math.random() * 0.4 - 0.2) * baseDelay
        const delay = Math.max(1000, baseDelay + jitter)

        reconnectAttemptsRef.current = attempts + 1

        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && enabled) connect()
        }, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch (e) {
      console.error('[useLogisticaWebSocket] Falha ao conectar:', e)
    }
  }, [enabled])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, connect])

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { sendMessage }
}
