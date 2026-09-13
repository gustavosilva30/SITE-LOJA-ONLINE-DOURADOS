/**
 * Título completo da peça master (catálogo): mesma regra na lista do Catálogo, sugestões em Produtos e persistência em `pecas_catalogo.nome`.
 */

export type PecaCompatibilidadeLike = {
  marca?: string | null
  modelo?: string | null
  ano?: string | null
  versao?: string | null
  motorizacao?: string | null
  familia?: string | null
}

export type PecaCatalogoNomeFields = {
  nome?: string | null
  marca_veiculo?: string | null
  modelo_veiculo?: string | null
  motorizacao?: string | null
  familia?: string | null
  ano_inicio?: number | null
  ano_fim?: number | null
  variacao?: string | null
  lado_esquerdo?: boolean
  lado_direito?: boolean
  categoria_id?: string | null
}

export type FormPecaNomeSlice = {
  nome?: string | null
  marca_veiculo?: string | null
  modelo_veiculo?: string | null
  motorizacao?: string | null
  familia?: string | null
  ano_inicio?: number | null
  ano_fim?: number | null
  variacao?: string | null
  lado_esquerdo?: boolean
  lado_direito?: boolean
  categoria_id?: string | null
}

export function compatFallbackMarcaModelo(compatList: PecaCompatibilidadeLike[]): { marca: string; modelos: string } {
  const marcas = [...new Set(compatList.map((c) => String(c.marca || '').trim()).filter(Boolean))]
  const modelos = [...new Set(compatList.map((c) => String(c.modelo || '').trim()).filter(Boolean))]
  return {
    marca: marcas.join(' '),
    modelos: modelos.join(', '),
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove o prefixo da marca no início de cada segmento (ex.: "VW Polo, VW Fox" → "Polo, Fox")
 * para não concatenar "Marca + Marca Modelo" no título.
 */
export function stripMarcaPrefixFromSegment(marca: string, segment: string): string {
  const m = marca.trim()
  let s = segment.trim()
  if (!m || !s) return s
  const re = new RegExp(`^${escapeRegex(m)}\\s+`, 'i')
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(re, '').trim()
  }
  return s
}

export function stripMarcaRepetidaDosModelos(marca: string, modelos: string): string {
  const m = marca.trim()
  if (!m || !modelos.trim()) return modelos.trim()
  const parts = modelos
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.map((p) => stripMarcaPrefixFromSegment(m, p)).filter(Boolean).join(', ')
}

function nomeContemMarcaRepetidaNoTexto(nome: string, marca: string | null | undefined): boolean {
  const m = String(marca ?? '').trim()
  if (!m || !nome.trim()) return false
  const mm = m.toLowerCase()
  const n = nome.toLowerCase()
  return n.includes(`${mm} ${mm}`)
}

/** Palavras idênticas consecutivas (case-insensitive), ignorando pontuação colada à palavra. */
function dedupeConsecutiveWordsIgnoreCase(s: string): string {
  const parts = s.split(/\s+/)
  const out: string[] = []
  let prevNorm = ''
  for (const w of parts) {
    if (!w) continue
    const norm = w.toLowerCase().replace(/^[,;:]+|[,;:]+$/g, "")
    if (norm && norm === prevNorm) continue
    out.push(w)
    prevNorm = norm || prevNorm
  }
  return out.join(" ")
}

/**
 * Reduz repetições comuns em títulos ML/n8n: blocos repetidos após " - ", listas "A, A, B", palavras duplicadas seguidas.
 */
export function compactCatalogPieceTitle(raw: string): string {
  let s = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!s) return s

  const dashParts = s.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean)
  if (dashParts.length > 1) {
    const seen = new Set<string>()
    const uniq: string[] = []
    for (const p of dashParts) {
      const k = p.toLowerCase().replace(/\s+/g, " ")
      if (seen.has(k)) continue
      seen.add(k)
      uniq.push(p)
    }
    s = uniq.join(" - ")
  }

  const dedupeCommaList = (segment: string) => {
    if (!segment.includes(",")) return segment
    const chunks = segment.split(",").map((x) => x.trim()).filter(Boolean)
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of chunks) {
      const k = c.toLowerCase().replace(/\s+/g, " ")
      if (seen.has(k)) continue
      seen.add(k)
      out.push(c)
    }
    return out.join(", ")
  }
  s = s.split(/\s*-\s*/).map(dedupeCommaList).join(" - ")

  s = dedupeConsecutiveWordsIgnoreCase(s)
  return s.replace(/\s+/g, " ").trim()
}

/** Remove ocorrências repetidas do mesmo part number no título (títulos ML/n8n repetem o PN). */
export function dedupePartNumberInTitle(s: string, partNumber: string): string {
  const pn = String(partNumber ?? "").trim()
  if (!pn || pn.length < 3) return s
  let n = 0
  return s
    .replace(new RegExp(escapeRegex(pn), "gi"), (m) => {
      n += 1
      return n === 1 ? m : ""
    })
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^\s*-\s*|\s*-\s*$/g, "")
    .trim()
}

/** Gravação em `pecas_catalogo.nome` vinda da integração n8n / ML: compacta e remove PN duplicado. */
export function sanitizeNomePecaCatalogoIntegracao(raw: string, partNumber: string): string {
  let s = compactCatalogPieceTitle(String(raw ?? "").trim())
  s = dedupePartNumberInTitle(s, partNumber)
  const final = s.replace(/\s+/g, " ").trim()
  return final.length > 60 ? final.substring(0, 60) : final
}

/**
 * Título longo (ex.: anúncio ML) já inclui marca + modelos — não concatenar de novo marca/modelo/anos.
 */
function tituloNomeBaseJaIncluiVeiculo(nomeBase: string, marca: string, modelos: string): boolean {
  const n = nomeBase.trim()
  if (n.length < 42) return false
  const m = marca.trim()
  if (!m) return false
  const nl = n.toLowerCase()
  const ml = m.toLowerCase()
  if (!nl.includes(ml)) return false
  const modFirst =
    modelos
      .split(/[,;/]/)[0]
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)[0] || ""
  if (modFirst.length >= 2 && nl.includes(modFirst.toLowerCase())) return true
  return n.split(/\s+/).filter(Boolean).length >= 14
}

/**
 * Monta o título: nome (ou categoria) + marca + modelo + família/geração + anos + motorização + lado + variação.
 * Usa linhas de compatibilidade quando marca/modelo/motor não estão no cabeçalho da peça.
 */
export function buildNomePecaMasterFromCampos(
  formPeca: FormPecaNomeSlice,
  opts: {
    categorias: { id: string; nome: string }[]
    compatList: PecaCompatibilidadeLike[]
    /** true: prioriza o nome da categoria; false: prioriza o nome da peça (BD / integração) */
    preferCategoriaNome: boolean
  }
): string {
  const { categorias, compatList, preferCategoriaNome } = opts
  const nomePeca = String(formPeca.nome ?? '').trim()
  const nomeCategoria = categorias.find((c) => c.id === formPeca.categoria_id)?.nome?.trim() || ''
  const nomeBase = preferCategoriaNome ? nomeCategoria || nomePeca : nomePeca || nomeCategoria

  let marca = String(formPeca.marca_veiculo ?? '').trim()
  let modelos = String(formPeca.modelo_veiculo ?? '').trim()
  if ((!marca || !modelos) && compatList.length > 0) {
    const fb = compatFallbackMarcaModelo(compatList)
    if (!marca) marca = fb.marca
    if (!modelos) modelos = fb.modelos
  }
  if (marca) {
    modelos = stripMarcaRepetidaDosModelos(marca, modelos)
  }

  const headerFam = String(formPeca.familia ?? '').trim()
  const fromCompat = compatList.map((c) => String(c.familia ?? '').trim()).filter(Boolean)
  const geracoesOrdered: string[] = []
  const seenFam = new Set<string>()
  for (const g of [headerFam, ...fromCompat]) {
    if (!g || seenFam.has(g)) continue
    seenFam.add(g)
    geracoesOrdered.push(g)
  }
  const geracoes = geracoesOrdered.join('/')

  let rangeAnos = ''
  if (formPeca.ano_inicio != null && formPeca.ano_fim != null) {
    rangeAnos =
      formPeca.ano_inicio === formPeca.ano_fim
        ? String(formPeca.ano_inicio)
        : `${formPeca.ano_inicio}/${formPeca.ano_fim}`
  }

  let motor = String(formPeca.motorizacao ?? '').trim()
  if (!motor && compatList.length > 0) {
    const motors = Array.from(new Set(compatList.map((c) => String(c.motorizacao ?? '').trim()).filter(Boolean)))
    motor = motors.join(', ')
  }

  const variacao = formPeca.variacao ? `- ${formPeca.variacao}` : ''
  const lado =
    formPeca.lado_esquerdo && formPeca.lado_direito
      ? 'PAR'
      : formPeca.lado_esquerdo
        ? 'LH'
        : formPeca.lado_direito
          ? 'RH'
          : ''

  if (tituloNomeBaseJaIncluiVeiculo(nomeBase, marca, modelos)) {
    return compactCatalogPieceTitle(nomeBase).toUpperCase()
  }

  // Regra do CRM: não incluir a marca no título (ela já existe como campo e polui caracteres).
  const montado = `${nomeBase} ${modelos} ${geracoes} ${rangeAnos} ${motor} ${lado} ${variacao}`
    .replace(/\s+/g, ' ')
    .trim()
  const final = compactCatalogPieceTitle(montado).toUpperCase()
  return final.length > 60 ? final.substring(0, 60) : final
}

/** Nome “curto” vindo do BD/integração (ex.: só “Alternador”) — vale montar título completo com os demais campos */
export function shouldMontarNomePecaMasterIncompleto(nomeRaw: string | null | undefined): boolean {
  const t = String(nomeRaw ?? '').trim()
  if (!t) return true
  const words = t.split(/\s+/).filter(Boolean)
  return words.length <= 2
}

/** Mesma lógica da lista do Catálogo master: título completo quando o nome no BD é genérico. */
export function nomePecaMasterParaExibicao(
  peca: PecaCatalogoNomeFields,
  compatRows: PecaCompatibilidadeLike[] | undefined,
  categorias: { id: string; nome: string }[]
): string {
  const rows = compatRows ?? []
  const nomeSlice: FormPecaNomeSlice = {
    nome: peca.nome ?? '',
    marca_veiculo: peca.marca_veiculo ?? '',
    modelo_veiculo: peca.modelo_veiculo ?? '',
    motorizacao: peca.motorizacao ?? '',
    familia: peca.familia ?? '',
    ano_inicio: peca.ano_inicio,
    ano_fim: peca.ano_fim,
    variacao: peca.variacao ?? '',
    lado_esquerdo: peca.lado_esquerdo,
    lado_direito: peca.lado_direito,
    categoria_id: peca.categoria_id,
  }
  const montado = buildNomePecaMasterFromCampos(nomeSlice, {
    categorias,
    compatList: rows,
    preferCategoriaNome: false,
  })
  const raw = peca.nome ?? ''
  if (shouldMontarNomePecaMasterIncompleto(raw) || nomeContemMarcaRepetidaNoTexto(raw, peca.marca_veiculo)) {
    return montado
  }
  const compact = compactCatalogPieceTitle(raw)
  // Títulos longos (ML/n8n): normalizar caixa como o título montado; nomes curtos mantêm o texto gravado
  if (compact.split(/\s+/).filter(Boolean).length >= 8 || compact.length >= 56) {
    return compact.toUpperCase()
  }
  return compact
}

/** Uma linha "Marca + modelos" sem repetir a marca em cada modelo; opcionalmente anos. */
export function veiculoBaseParaExibicao(
  marca: string | null | undefined,
  modelo: string | null | undefined,
  anoInicio?: number | null,
  anoFim?: number | null,
  geracao?: string | null
): string {
  const m = String(marca ?? '').trim()
  const mod = stripMarcaRepetidaDosModelos(m, String(modelo ?? '').trim())
  const g = String(geracao ?? '').trim()
  const base = (() => {
    let res = m && mod ? `${m} ${mod}`.replace(/\s+/g, ' ').trim() : m || mod || ''
    if (g) res = `${res} ${g}`.trim()
    return res
  })()
  if (!base) return '—'
  if (anoInicio != null && anoFim != null) {
    const a = anoInicio === anoFim ? `${anoInicio}` : `${anoInicio}/${anoFim}`
    return `${base} (${a})`
  }
  return base
}

/**
 * Gera um resumo textual das compatibilidades selecionadas.
 */
export function gerarResumoCompatibilidade(selectedVersoes: any[]): string {
  if (!selectedVersoes || selectedVersoes.length === 0) return ""

  const grouped: Record<string, Set<string>> = {}

  selectedVersoes.forEach((v) => {
    const key = `${v.marca} ${v.modelo}${v.familia ? " " + v.familia : ""}`
    if (!grouped[key]) grouped[key] = new Set()

    const years = `${v.ano_inicio}-${v.ano_fim || "at."}`
    const specs = [v.versao, v.motorizacao].filter(Boolean).join(" ")
    grouped[key].add(`${years}${specs ? " " + specs : ""}`)
  })

  return Object.entries(grouped)
    .map(([car, specs]) => `${car.toUpperCase()}: ${Array.from(specs).join(", ")}`)
    .join("\n")
}
