/**
 * Compatibilidades a partir do catálogo veiculos_master + motorização inferida do nome do produto.
 */

import { limparModeloCampo, marcasEquivalentes, extractAnosDoTexto } from '@/lib/parseNomeVeiculoPeca'

export type VehicleMasterRow = {
  marca?: string | null
  modelo?: string | null
  ano?: string | null
  ano_inicio?: number | null
  ano_fim?: number | null
  versao?: string | null
  motorizacao?: string | null
  familia?: string | null
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Extrai padrões de motorização do nome (ex.: "1.0 16v", "1,6 8v", "2.0 TSI", "1.8").
 * Usado para filtrar linhas do veiculos_master quando o vendedor coloca o motor no título.
 */
export function extractMotorPatternsFromNome(nome: string): string[] {
  if (!nome?.trim()) return []
  const raw = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const found = new Set<string>()

  // Blocos tipo 1.0 16v / 1,6 8v / 2.0 16v / 2.0 / 3.0
  const blockRe = /\b(\d[.,]\d+)\s*(16v|8v|12v|20v|4v|6v)?\b/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(raw))) {
    const lit = `${m[1].replace(',', '.')}${(m[2] || '').toLowerCase()}`
    found.add(lit)
  }

  return [...found].filter(Boolean)
}

/** Cada linha do catálogo pode ser um ano único ("2009") ou intervalo no campo texto */
function yearRangeFromVehicle(v: VehicleMasterRow): { inicio: number | null; fim: number | null } {
  if (v.ano_inicio != null && v.ano_fim != null) {
    const a = Number(v.ano_inicio)
    const b = Number(v.ano_fim)
    return { inicio: Math.min(a, b), fim: Math.max(a, b) }
  }
  const raw = String(v.ano ?? '').trim()
  if (!raw) return { inicio: null, fim: null }
  const range = raw.match(/^(\d{4})\s*[/\-\u2013]\s*(\d{4})$/)
  if (range) {
    const a = parseInt(range[1], 10)
    const b = parseInt(range[2], 10)
    return { inicio: Math.min(a, b), fim: Math.max(a, b) }
  }
  const single = raw.match(/\b(19\d{2}|20\d{2})\b/)
  if (single) {
    const y = parseInt(single[1], 10)
    return { inicio: y, fim: y }
  }
  const n = parseInt(raw.replace(/\D/g, ''), 10)
  if (!Number.isNaN(n) && n >= 1960 && n <= 2040) return { inicio: n, fim: n }
  return { inicio: null, fim: null }
}

/** Intervalo de anos do produto [inicio,fim] intersecta o do veículo no catálogo? */
export function yearsOverlap(pInicio: number, pFim: number, v: VehicleMasterRow): boolean {
  const { inicio: vi, fim: vf } = yearRangeFromVehicle(v)
  if (vi == null || vf == null) return true
  return vi <= pFim && vf >= pInicio
}

/** Se o produto não tem intervalo de anos definido, não restringe por ano. */
export function yearsOverlapOptional(
  pInicio: number | null,
  pFim: number | null,
  v: VehicleMasterRow
): boolean {
  if (pInicio == null || pFim == null) return true
  return yearsOverlap(pInicio, pFim, v)
}

/** Normaliza ano início/fim opcionais (um só ano preenchido vira intervalo de 1 ano). */
export function resolveProductYearRange(
  ano_inicio: unknown,
  ano_fim: unknown
): { inicio: number | null; fim: number | null } {
  const parse = (x: unknown): number | null => {
    if (x === '' || x === null || x === undefined) return null
    const n = Number(x)
    return !Number.isNaN(n) && n >= 1960 && n <= 2040 ? n : null
  }
  const a = parse(ano_inicio)
  const b = parse(ano_fim)
  if (a != null && b != null) {
    return { inicio: Math.min(a, b), fim: Math.max(a, b) }
  }
  if (a != null) return { inicio: a, fim: a }
  if (b != null) return { inicio: b, fim: b }
  return { inicio: null, fim: null }
}

/**
 * Se não há padrões no nome → aceita qualquer motorização do catálogo (incl. vazia).
 * Se há padrões → inclui linhas sem motor OU cuja motorização contém algum padrão.
 */
export function motorMatches(patterns: string[], vehicleMotor: string | null | undefined): boolean {
  if (patterns.length === 0) return true
  const vm = (vehicleMotor || '').trim()
  if (!vm) return true
  const nvm = norm(vm)
  return patterns.some((p) => {
    const np = norm(p)
    return nvm.includes(np) || np.includes(nvm) || nvm.replace(/\s/g, '').includes(np.replace(/\s/g, ''))
  })
}

/** Se o produto tem família (G5), exige linha sem família no catálogo ou mesma família */
export function familiaMatches(familiaProduto: string | null | undefined, vFamilia: string | null | undefined): boolean {
  const fp = (familiaProduto || '').trim()
  if (!fp) return true
  const vf = (vFamilia || '').trim()
  if (!vf) return true
  const a = norm(fp)
  const b = norm(vf)
  return a === b || b.includes(a) || a.includes(b)
}

export function extractCambioFromNome(nome: string): 'auto' | 'manual' | null {
  if (!nome?.trim()) return null
  const n = norm(nome)
  if (/\b(aut|auto|autom|automatica|automatico|cvt)\b/i.test(n)) return 'auto'
  if (/\b(man|manual)\b/i.test(n)) return 'manual'
  return null
}

export function cambioMatches(cambioAlvo: 'auto' | 'manual' | null, versao: string | null): boolean {
  if (!cambioAlvo) return true
  const v = norm(versao || '')
  
  const isAuto = /\b(aut|auto|autom|automatica|automatico|cvt|at)\b/i.test(v)
  const isManual = /\b(man|manual|mt)\b/i.test(v)
  
  if (cambioAlvo === 'auto') {
    if (isManual && !isAuto) return false
  }
  if (cambioAlvo === 'manual') {
    if (isAuto && !isManual) return false
  }
  
  return true
}

export type CompatRowInput = {
  marca: string
  modelo: string
  ano: string
  versao: string
  motorizacao: string
  familia: string
}

/** Filtra veiculos_master: aplica só os critérios que o produto tiver preenchidos (marca/modelo/anos). */
export function filterMasterVehiclesToCompat(
  master: VehicleMasterRow[],
  opts: {
    marca?: string
    modelo?: string
    ano_inicio?: number | null
    ano_fim?: number | null
    nomeProduto: string
    /** G5, G6… vindo do campo versão e/ou do nome do produto */
    familiaProduto?: string | null
  }
): CompatRowInput[] {
  const marcaFiltro = (opts.marca || '').trim()
  const modeloFiltro = (opts.modelo || '').trim()
  const modeloProd = modeloFiltro ? limparModeloCampo(modeloFiltro) : ''
  let { inicio: yrInicio, fim: yrFim } = resolveProductYearRange(opts.ano_inicio, opts.ano_fim)
  // Se os campos estão vazios mas o título traz "2016/2020" ou "2016 A 2020", usa isso — senão o filtro de ano desliga e entram todos os anos do modelo.
  if (yrInicio == null && yrFim == null) {
    const fromNome = extractAnosDoTexto(opts.nomeProduto || '')
    if (fromNome.ano_inicio != null && fromNome.ano_fim != null) {
      yrInicio = fromNome.ano_inicio
      yrFim = fromNome.ano_fim
    }
  }
  const filtraMarca = marcaFiltro.length > 0
  const filtraModelo = modeloProd.length > 0
  const filtraAno = yrInicio != null && yrFim != null

  const patterns = extractMotorPatternsFromNome(opts.nomeProduto)
  const cambioAlvo = extractCambioFromNome(opts.nomeProduto)
  
  // Só código G1–G9 (campo versão ou nome); nunca o texto livre inteiro — evita filtrar tudo por engano
  const famVersG = (opts.familiaProduto || '').match(/\b(G[1-9])\b/i)?.[1]?.toUpperCase() || ''
  const famNomeG = (opts.nomeProduto || '').match(/\b(G[1-9])\b/i)?.[1]?.toUpperCase() || ''
  const famAlvo = famVersG || famNomeG

  const rows = master.filter((v) => {
    if (!v.marca || !v.modelo) return false
    if (filtraMarca && !marcasEquivalentes(v.marca, marcaFiltro)) return false
    if (filtraModelo) {
      const searchWords = norm(modeloProd).split(/\s+/);
      const targetStr = norm(v.marca) + ' ' + norm(limparModeloCampo(v.modelo));
      const match = searchWords.every(w => targetStr.includes(w));
      if (!match) return false;
    }
    if (filtraAno && !yearsOverlapOptional(yrInicio, yrFim, v)) return false
    if (!motorMatches(patterns, v.motorizacao)) return false
    if (!familiaMatches(famAlvo || null, v.familia)) return false
    if (!cambioMatches(cambioAlvo, v.versao)) return false
    return true
  })

  const seen = new Set<string>()
  const out: CompatRowInput[] = []
  for (const v of rows) {
    const anoStr =
      v.ano_inicio != null && v.ano_fim != null
        ? v.ano_inicio === v.ano_fim
          ? String(v.ano_inicio)
          : `${v.ano_inicio}/${v.ano_fim}`
        : v.ano != null
          ? String(v.ano)
          : ''
    const key = [
      v.marca,
      v.modelo,
      anoStr,
      v.versao || '',
      v.motorizacao || '',
      v.familia || '',
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      marca: v.marca || '',
      modelo: v.modelo || '',
      ano: anoStr,
      versao: (v.versao || '').trim(),
      motorizacao: (v.motorizacao || '').trim(),
      familia: (v.familia || '').trim(),
    })
  }

  // Sem marca/modelo/ano no produto o filtro fica só motor/família — limita para não travar a UI
  const filtroMuitoAberto = !filtraMarca && !filtraModelo && !filtraAno
  if (filtroMuitoAberto && out.length > 500) {
    return out.slice(0, 500)
  }
  return out
}

/** Chave única para deduplicar linhas de compatibilidade na UI */
export function compatRowDedupeKey(c: {
  marca?: string
  modelo?: string
  ano?: string
  versao?: string
  motorizacao?: string
  familia?: string
}): string {
  return [
    (c.marca || '').trim(),
    (c.modelo || '').trim(),
    (c.ano || '').trim(),
    (c.versao || '').trim(),
    (c.motorizacao || '').trim(),
    (c.familia || '').trim(),
  ].join('|')
}

export interface BuscaVeiculosMl {
  marca?: string | null
  modelo?: string | null
  ano_inicio?: number | null
  ano_fim?: number | null
  motorizacao?: string | null
}

/**
 * Busca veículos no catálogo do Mercado Livre (espelhado em ml_veiculos_catalogo)
 * e devolve linhas prontas para a lista de compatibilidade do produto.
 *
 * Substitui o filtro sobre o Banco de Veículos interno: só entram veículos que
 * existem no catálogo do ML e trazem ml_product_id — sem ele o marketplace não
 * indexa a compatibilidade, que era a causa dos anúncios subirem sem ficha.
 */
export async function buscarVeiculosMlParaCompat(p: BuscaVeiculosMl) {
  const marca = (p.marca || '').trim()
  const modelo = (p.modelo || '').trim()
  if (!marca && !modelo) return []

  try {
    const { mercadoLivreApi } = await import('@/lib/api')
    const res = await mercadoLivreApi.buscarVeiculosPorCampos({
      marca,
      modelo,
      ano_inicio: p.ano_inicio ?? null,
      ano_fim: p.ano_fim ?? null,
      motorizacao: p.motorizacao ?? null,
    })
    const encontrados = ((res as any)?.results || []) as any[]
    return encontrados
      .filter((v) => v.ml_product_id)
      .map((v) => ({
        marca: v.marca as string,
        modelo: v.modelo as string,
        ano: (v.ano ?? null) as string | null,
        versao: (v.versao ?? null) as string | null,
        motorizacao: (v.motorizacao ?? null) as string | null,
        familia: null as string | null,
        ml_product_id: v.ml_product_id as string,
      }))
  } catch {
    return []
  }
}
