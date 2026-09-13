/**
 * Normaliza nome de peça/produto para equivalência com `normalize_nome_catalogo_match` no PostgreSQL
 * (acentos, espaços, traços unicode → hífen ASCII).
 */
const UNICODE_DASH_RE = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D\u00AD]/g

export function normalizeNomeCatalogoMatch(s: string): string {
  let t = (s ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
  t = t.replace(UNICODE_DASH_RE, '-')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}
