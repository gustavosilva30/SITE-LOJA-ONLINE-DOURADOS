import { sucatasApi } from "@/lib/api"

/** Peças que entram no rateio do custo total da sucata (exclui vendidas e descartadas). */
export const STATUS_PECAS_PARA_RATEIO = ["Disponível", "Cadastrada no Estoque"] as const

export type PecaPesoRateio = { id: string; preco_venda: number; quantidade?: number }

function pesoRateioLinha(p: PecaPesoRateio): number {
  const unit = Math.max(0, Number(p.preco_venda) || 0)
  const q = Math.max(1, Math.floor(Number(p.quantidade) || 1))
  return unit * q
}

/**
 * Distribui `custoTotal` em centavos de forma que a soma bata exatamente.
 * Pesos = preço de venda unitário × quantidade por linha (receita esperada da linha).
 * Se todos os pesos forem zero, divide igualmente entre as linhas.
 */
export function ratearCustoPorPrecoVenda(custoTotal: number, pecas: PecaPesoRateio[]): Map<string, number> {
  const out = new Map<string, number>()
  const n = pecas.length
  if (n === 0) return out

  const centsTotal = Math.round(Number(custoTotal) * 100)
  if (centsTotal <= 0) {
    pecas.forEach((p) => out.set(p.id, 0))
    return out
  }

  let weights = pecas.map((p) => pesoRateioLinha(p))
  let sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0) {
    weights = new Array(n).fill(1)
    sumW = n
  }

  const exact = weights.map((w) => (centsTotal * w) / sumW)
  const base = exact.map((x) => Math.floor(x))
  const remainder = centsTotal - base.reduce((a, b) => a + b, 0)

  const order = exact
    .map((x, i) => ({ i, frac: x - base[i]! }))
    .sort((a, b) => b.frac - a.frac)

  const cents = [...base]
  for (let r = 0; r < remainder; r++) {
    cents[order[r]!.i]++
  }

  pecas.forEach((p, i) => {
    out.set(p.id, (cents[i] ?? 0) / 100)
  })
  return out
}

export async function aplicarRateioCustoSucata(
  sucataId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sucatasApi.aplicarRateio(sucataId)
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
