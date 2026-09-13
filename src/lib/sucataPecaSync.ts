import { sucatasApi } from "@/lib/api"
import { aplicarRateioCustoSucata } from "@/lib/sucataCustoRateio"

export type ProdutoParaSucataPeca = {
  id: string
  nome?: string | null
  descricao?: string | null
  part_number?: string | null
  custo?: number | null
  preco?: number | null
  qualidade?: string | null
  localizacao_id?: string | null
  imagem_urls?: string[] | null
}

/**
 * Quando um produto vinculado a uma peça de sucata é alterado no estoque (preço, nome, etc.),
 * espelha os valores em `sucatas_pecas` para a lista da sucata continuar coerente.
 * O custo da peça não é copiado do produto: após o espelhamento, aplica-se o rateio do custo total da sucata (`aplicarRateioCustoSucata`).
 */
export async function syncSucataPecaFromProduto(
  produto: ProdutoParaSucataPeca,
  opts?: { sucataId?: string | null }
) {
  const out = await sucatasApi.syncPecaFromProduto({
    produto: { ...produto, id: produto.id } as Record<string, unknown>,
    sucata_id: opts?.sucataId ?? undefined,
  })
  if (!out?.updated) return
  for (const sid of out.sucata_ids || []) {
    if (sid) await aplicarRateioCustoSucata(sid)
  }
}
