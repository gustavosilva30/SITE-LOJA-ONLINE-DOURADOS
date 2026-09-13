/**
 * Registro leve de atividades e erros (PostgreSQL via API / sistema_logs).
 * Não usa await na UI: envia em idle/timeout para não travar a thread.
 */

import { configuracoesApi } from '@/lib/api'

const LIMITS = { mensagem: 1800, detalhe: 900, acao: 100, codigo: 80 } as const

function clip(s: string, max: number): string {
  if (!s) return ''
  const t = s.trim()
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

export type SystemLogNivel = 'acao' | 'erro' | 'info'

export type SystemLogRow = {
  atendente_id?: string | null
  nivel: SystemLogNivel
  acao?: string | null
  mensagem: string
  codigo_erro?: string | null
  detalhe?: string | null
  origem?: string
}

function extractErrorParts(err: unknown): { codigo: string; detalhe: string } {
  if (err == null) return { codigo: 'UNKNOWN', detalhe: '' }

  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>
    const code = o.code != null ? String(o.code) : ''
    const msg = o.message != null ? String(o.message) : ''
    const details = o.details != null ? String(o.details) : ''
    const hint = o.hint != null ? String(o.hint) : ''
    if (code || msg) {
      const detalhe = [msg, details, hint].filter(Boolean).join(' | ')
      return {
        codigo: clip(code || 'ERROR', LIMITS.codigo),
        detalhe: clip(detalhe, LIMITS.detalhe),
      }
    }
  }

  if (err instanceof Error) {
    const stack = err.stack ? '\n' + err.stack.slice(0, 500) : ''
    return {
      codigo: clip(err.name || 'Error', LIMITS.codigo),
      detalhe: clip(err.message + stack, LIMITS.detalhe),
    }
  }

  return { codigo: 'OTHER', detalhe: clip(String(err), LIMITS.detalhe) }
}

function scheduleInsert(row: {
  atendente_id?: string | null
  nivel: SystemLogNivel
  acao?: string | null
  mensagem: string
  codigo_erro?: string | null
  detalhe?: string | null
  origem?: string
}) {
  const run = () => {
    void configuracoesApi
      .sistemaLog({
        atendente_id: row.atendente_id ?? null,
        nivel: row.nivel,
        acao: row.acao ?? null,
        mensagem: row.mensagem,
        codigo_erro: row.codigo_erro ?? null,
        detalhe: row.detalhe ?? null,
        origem: row.origem ?? 'web',
      })
      .catch((err: unknown) => console.warn('[sistema_logs]', err))
  }
  try {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => run(), { timeout: 4000 })
    } else {
      setTimeout(run, 0)
    }
  } catch {
    setTimeout(run, 0)
  }
}

/** Envio genérico (use os atalhos abaixo quando possível). */
export function systemLog(payload: SystemLogRow) {
  const row = {
    atendente_id: payload.atendente_id ?? null,
    nivel: payload.nivel,
    acao: payload.acao ? clip(payload.acao, LIMITS.acao) : null,
    mensagem: clip(payload.mensagem, LIMITS.mensagem),
    codigo_erro: payload.codigo_erro ? clip(payload.codigo_erro, LIMITS.codigo) : null,
    detalhe: payload.detalhe ? clip(payload.detalhe, LIMITS.detalhe) : null,
    origem: payload.origem ?? 'web',
  }
  scheduleInsert(row)
}

/** Atividade do dia (data/hora vão em created_at no banco). */
export function logAcao(acao: string, mensagem: string, atendenteId?: string | null) {
  systemLog({
    nivel: 'acao',
    acao,
    mensagem,
    atendente_id: atendenteId ?? null,
  })
}

export function logInfo(mensagem: string, atendenteId?: string | null, acao?: string | null) {
  systemLog({
    nivel: 'info',
    acao: acao ?? null,
    mensagem,
    atendente_id: atendenteId ?? null,
  })
}

/** Erro com código + detalhe truncado. */
export function logErro(mensagem: string, err: unknown, atendenteId?: string | null, acao?: string | null) {
  const { codigo, detalhe } = extractErrorParts(err)
  systemLog({
    nivel: 'erro',
    acao: acao ?? null,
    mensagem: clip(mensagem, LIMITS.mensagem),
    codigo_erro: codigo || null,
    detalhe: detalhe || null,
    atendente_id: atendenteId ?? null,
  })
}
