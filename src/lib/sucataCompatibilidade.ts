import { sucatasApi } from "@/lib/api"

export type SucataCompatRow = {
  id: string
  sucata_id: string
  marca: string
  modelo: string
  ano: string | null
  versao: string | null
  motorizacao: string | null
  familia: string | null
  created_at?: string
}

/**
 * @deprecated Preferir `sucatasApi.mergeCompat(sucataId, produtoId)` diretamente.
 * Insere em produtos_compatibilidade as linhas da sucata que ainda não existem no produto.
 */
export async function mergeCompatibilidadesSucataNoProduto(
  sucataId: string,
  produtoId: string
): Promise<{ ok: true; inserted: number } | { ok: false; error: string }> {
  try {
    const r = await sucatasApi.mergeCompat(sucataId, produtoId)
    const inserted = typeof r?.inserted === "number" ? r.inserted : 0
    return { ok: true, inserted }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
