import { getApiBaseUrl } from '@/lib/apiBase'
import { getAuthToken } from '@/lib/auth'

export type BuscaPartNumberMasterOk =
    | {
          ok: true
          source: 'database'
          part_number: string
          peca: Record<string, unknown>
          compatibilidades: Record<string, unknown>[]
      }
    | {
          ok: true
          source: 'n8n'
          part_number: string
          n8n_response?: unknown
          empty?: boolean
          message?: string
          peca?: Record<string, unknown>
          compatibilidades?: Record<string, unknown>[]
          error?: string
      }

export type BuscaPartNumberMasterFail = {
    ok: false
    part_number: string
    error: string
    n8n_http_status?: number
    n8n_response?: unknown
    n8n_raw_text?: string
}

export type BuscaPartNumberMasterResult = BuscaPartNumberMasterOk | BuscaPartNumberMasterFail

export async function buscaPartNumberMaster(
    partNumber: string,
    _options?: { persist?: boolean }
): Promise<BuscaPartNumberMasterResult> {
    const token = getAuthToken()
    if (!token) throw new Error('Sessão expirada. Faça login novamente.')

    const res = await fetch(`${getApiBaseUrl()}/api/pecas-master/crm/busca-partnumber`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            part_number: partNumber,
        }),
    })

    let data: unknown
    try {
        data = await res.json()
    } catch {
        throw new Error(`Resposta inválida do servidor (HTTP ${res.status})`)
    }

    if (res.ok && data && typeof data === 'object' && 'ok' in data && (data as { ok: boolean }).ok === true) {
        return data as BuscaPartNumberMasterOk
    }

    if (!res.ok && data && typeof data === 'object' && 'ok' in data && (data as { ok: boolean }).ok === false) {
        return data as BuscaPartNumberMasterFail
    }

    const errMsg =
        data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : `HTTP ${res.status}`
    throw new Error(errMsg)
}
