export type IbgeMunicipio = { id: number; nome: string }

const cache = new Map<string, IbgeMunicipio[]>()

/** Lista municípios do IBGE por UF (cache em memória). */
export async function fetchMunicipiosPorUf(uf: string): Promise<IbgeMunicipio[]> {
  const key = uf.toUpperCase()
  const hit = cache.get(key)
  if (hit) return hit

  const res = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(key)}/municipios`
  )
  if (!res.ok) throw new Error(`IBGE: ${res.status}`)
  const data = (await res.json()) as { id: number; nome: string }[]
  const list = data.map((m) => ({ id: m.id, nome: m.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  cache.set(key, list)
  return list
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}
