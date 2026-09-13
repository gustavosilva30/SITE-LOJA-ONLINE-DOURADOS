/**
 * Interpreta o título da peça (ex.: "CAMBIO GOL G5 1.6 2008/2012") para preencher
 * marca, modelo, anos, família (G5) usando o cadastro de modelos/marcas do CRM.
 */

export type ParsedNomeVeiculo = {
  marca: string | null
  modelo: string | null
  familia: string | null
  ano_inicio: number | null
  ano_fim: number | null
  motorizacao: string | null
}

export const normKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Remove preposições/conjunções de ligação entre palavras para comparar textos
 * (ex.: "caixa direção" alinha com "caixa de direção").
 */
export function collapsePortugueseJoiners(s: string): string {
  let t = normKey(s)
  const JOINER = /\s+(de|da|do|das|dos|e)\s+/gi
  let prev = ''
  while (prev !== t) {
    prev = t
    t = t.replace(JOINER, ' ')
  }
  return t.replace(/\s+/g, ' ').trim()
}

const norm = normKey

/** Remove ano que foi parar no início do modelo por engano (ex.: "2008 GOL" → "GOL") */
export function limparModeloCampo(modelo: string): string {
  return modelo.replace(/^\s*\d{4}\s+/i, '').trim()
}

/**
 * Duas marcas coincidem (tolera truncagem tipo "Volkswag" / "Volkswagen").
 */
export function marcasEquivalentes(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const min = Math.min(na.length, nb.length)
  if (min >= 4 && (na.startsWith(nb) || nb.startsWith(na))) return true
  if (na.includes('volks') && nb.includes('volks')) return true
  if ((na === 'vw' || na === 'v w') && nb.includes('volks')) return true
  if ((nb === 'vw' || nb === 'v w') && na.includes('volks')) return true
  return false
}

/**
 * Extrai intervalo (ou ano único) a partir do título/descrição.
 * Usado também para filtrar compatibilidades quando os campos ano_inicio/ano_fim estão vazios mas o nome traz "2016/2020" ou "2016 A 2020".
 */
export function extractAnosDoTexto(raw: string): { ano_inicio: number | null; ano_fim: number | null } {
  const empty = { ano_inicio: null as number | null, ano_fim: null as number | null }
  if (!raw?.trim()) return empty

  const text = raw.trim()
  let anoInicio: number | null = null
  let anoFim: number | null = null

  const rangeSlash = text.match(/\b(19\d{2}|20\d{2})\s*[/\u2013\-]\s*(19\d{2}|20\d{2})\b/)
  const rangeA = text.match(/\b(19\d{2}|20\d{2})\s+a\s+(19\d{2}|20\d{2})\b/i)
  const rangeAte = text.match(/\b(19\d{2}|20\d{2})\s+(?:até|ate)\s+(19\d{2}|20\d{2})\b/i)
  if (rangeSlash) {
    const a = parseInt(rangeSlash[1], 10)
    const b = parseInt(rangeSlash[2], 10)
    anoInicio = Math.min(a, b)
    anoFim = Math.max(a, b)
  } else if (rangeA) {
    const a = parseInt(rangeA[1], 10)
    const b = parseInt(rangeA[2], 10)
    anoInicio = Math.min(a, b)
    anoFim = Math.max(a, b)
  } else if (rangeAte) {
    const a = parseInt(rangeAte[1], 10)
    const b = parseInt(rangeAte[2], 10)
    anoInicio = Math.min(a, b)
    anoFim = Math.max(a, b)
  } else {
    const yearRe = /\b(19\d{2}|20\d{2})\b/g
    const found: number[] = []
    let m: RegExpExecArray | null
    while ((m = yearRe.exec(text))) {
      const y = parseInt(m[1], 10)
      if (y >= 1970 && y <= 2040) found.push(y)
    }
    if (found.length >= 2) {
      anoInicio = Math.min(...found)
      anoFim = Math.max(...found)
    } else if (found.length === 1) {
      anoInicio = found[0]
      anoFim = found[0]
    }
  }

  return { ano_inicio: anoInicio, ano_fim: anoFim }
}

/**
 * Extrai marca, modelo, G5/G6, anos a partir do nome.
 * Usa a lista de modelos do banco (ordenar por nome mais longo primeiro).
 */
export function parseNomeVeiculoPeca(
  text: string,
  opts: {
    nomesModelos: string[]
    nomesMarcas: string[]
    /** marca_id -> nome marca */
    marcaPorModeloNome?: Map<string, string>
  }
): ParsedNomeVeiculo {
  const empty: ParsedNomeVeiculo = {
    marca: null,
    modelo: null,
    familia: null,
    ano_inicio: null,
    ano_fim: null,
    motorizacao: null,
  }
  if (!text?.trim()) return empty

  const raw = text.trim()
  const n = norm(raw)

  // 1) Anos (mesma regra que extractAnosDoTexto)
  const { ano_inicio: anoInicio, ano_fim: anoFim } = extractAnosDoTexto(raw)

  // 2) Família G1–G9
  let familia: string | null = null
  const famM = raw.match(/\b(G[1-9])\b/i)
  if (famM) familia = famM[1].toUpperCase()

  let motorizacao: string | null = null
  const motM = raw.match(/\b(1\.\d|2\.\d|3\.\d|4\.\d|5\.\d|v6|v8|v10|v12)\b(?:\s+(8v|16v|20v|24v))?/i)
  if (motM) motorizacao = motM[0].toUpperCase()

  // Texto sem anos para não confundir ano com modelo (ex.: Peugeot "2008" vs 2008/2012)
  const nForModel = stripYearLikeTokensForModelSearch(n)

  // 3) Modelo: maior nome da lista (CRM) contido como palavra no texto; fallback para nomes comuns
  const modelosSorted = [...opts.nomesModelos].filter(Boolean).sort((a, b) => b.length - a.length)
  let modeloEscolhido: string | null = null
  for (const nomeMod of modelosSorted) {
    const nm = norm(nomeMod)
    if (nm.length < 2) continue
    // Nunca tratar só 4 dígitos como modelo quando vem do cadastro (ex.: "2008" = Peugeot)
    if (/^\d{4}$/.test(nm)) continue
    const re = new RegExp(`\\b${escapeRe(nm)}\\b`, 'i')
    if (re.test(nForModel)) {
      modeloEscolhido = nomeMod
      break
    }
  }
  if (!modeloEscolhido) {
    const FALLBACK = [
      'CROSSFOX',
      'SPACEFOX',
      'VOYAGE',
      'SAVEIRO',
      'PARATI',
      'SANTANA',
      'AMAROK',
      'VIRTUS',
      'NIVUS',
      'JETTA',
      'PASSAT',
      'UNO',
      'PALIO',
      'SIENA',
      'STRADA',
      'ONIX',
      'PRISMA',
      'CELTA',
      'CORSA',
      'GOL',
      'FOX',
      'POLO',
      'GOLF',
    ]
    for (const tok of FALLBACK.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b${escapeRe(norm(tok))}\\b`, 'i')
      if (re.test(nForModel)) {
        modeloEscolhido = tok
        break
      }
    }
  }

  // 4) Marca: primeiro mapa/heurística do modelo (mais confiável que substring no título);
  //    depois nome da marca no texto (ex.: "Fiat Uno" quando o modelo já foi identificado)
  let marca: string | null = null
  if (modeloEscolhido && opts.marcaPorModeloNome?.has(normKey(modeloEscolhido))) {
    marca = opts.marcaPorModeloNome.get(normKey(modeloEscolhido)) || null
  }
  if (!marca && modeloEscolhido) {
    const infer = inferirMarcaPorModelo(norm(modeloEscolhido))
    if (infer) marca = infer
  }
  if (!marca) {
    const marcasSorted = [...opts.nomesMarcas].filter(Boolean).sort((a, b) => b.length - a.length)
    for (const nm of marcasSorted) {
      const mm = norm(nm)
      if (mm.length < 2) continue
      const re = new RegExp(`\\b${escapeRe(mm)}\\b`, 'i')
      if (re.test(n)) {
        marca = nm
        break
      }
    }
  }

  return {
    marca,
    modelo: modeloEscolhido,
    familia,
    ano_inicio: anoInicio,
    ano_fim: anoFim,
    motorizacao,
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove anos de veículo do texto usado só na detecção de modelo.
 * Evita confundir "2008/2012" ou "2008" com o modelo Peugeot "2008".
 */
function stripYearLikeTokensForModelSearch(text: string): string {
  let t = text
  t = t.replace(/\b(19\d{2}|20\d{2})\s*[/\u2013\-]\s*(19\d{2}|20\d{2})\b/g, ' ')
  t = t.replace(/\b(19\d{2}|20\d{2})\s+a\s+(19\d{2}|20\d{2})\b/gi, ' ')
  t = t.replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/** Fallback quando não há mapa marca_id (heurística comum no BR) */
function inferirMarcaPorModelo(modeloNorm: string): string | null {
  const vw = /^(gol|voyage|fox|polo|amarok|saveiro|parati|golf|jetta|passat|virtus|nivus|up|t.cross|t cross|spacefox|crossfox|bora)$/i
  const fiat = /^(uno|palio|strada|siena|idea|argo|cronos|mobi|toro)$/i
  const gm = /^(onix|prisma|cobalt|celta|corsa|meriva|montana|s10|tracker|spin)$/i
  const ford = /^(ka|fiesta|focus|ecosport|ranger|fusion)$/i
  if (vw.test(modeloNorm)) return 'Volkswagen'
  if (fiat.test(modeloNorm)) return 'Fiat'
  if (gm.test(modeloNorm)) return 'Chevrolet'
  if (ford.test(modeloNorm)) return 'Ford'
  return null
}

const FALLBACK_MODELOS_BULK = [
  'CROSSFOX',
  'SPACEFOX',
  'VOYAGE',
  'SAVEIRO',
  'PARATI',
  'SANTANA',
  'AMAROK',
  'VIRTUS',
  'NIVUS',
  'JETTA',
  'PASSAT',
  'UNO',
  'PALIO',
  'SIENA',
  'STRADA',
  'ONIX',
  'PRISMA',
  'CELTA',
  'CORSA',
  'GOL',
  'FOX',
  'POLO',
  'GOLF',
]

/** Tokens da categoria exceto "de", "da", "e" isolados (para casar início do nome com flexibilidade). */
function significantCategoryParts(cat: string): string[] {
  return cat
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^(de|da|do|das|dos|e)$/i.test(p))
}

/** Permite zero ou mais " de ", " da ", etc. entre cada palavra significativa da categoria. */
function buildFlexibleCategoryPrefixRe(cat: string): RegExp | null {
  const parts = significantCategoryParts(cat)
  if (parts.length === 0) return null
  const between = '(?:\\s+(?:de|da|do|das|dos|e)\\s+)*\\s+'
  const body = parts.map(escapeRe).join(between)
  return new RegExp(`^${body}(?=\\s|$)`, 'i')
}

/**
 * Expande abreviações de lados comuns para facilitar o match da categoria.
 */
function expandSideAbbreviations(text: string): string {
  let t = text;
  t = t.replace(/\ble\b/gi, 'esq');
  t = t.replace(/\bld\b/gi, 'dir');
  t = t.replace(/\bte\b/gi, 'tras esq');
  t = t.replace(/\btd\b/gi, 'tras dir');
  t = t.replace(/\bde\b/gi, 'diant esq');
  t = t.replace(/\bdd\b/gi, 'diant dir');
  return t;
}

/**
 * Detecta categoria baseada na intersecção de palavras-chave, ignorando ordem e acentuação.
 * Expande siglas de lados (LE, LD, etc) antes de comparar.
 */
function extrairCategoriaPrefixo(
  raw: string,
  categoriasNomes: string[]
): { categoria: string | null; rest: string } {
  const t = raw.trim()
  if (!t || categoriasNomes.length === 0) return { categoria: null, rest: t }
  
  const expandedText = expandSideAbbreviations(t);
  const textWordsArray = significantCategoryParts(normKey(expandedText));
  const textWords = new Set(textWordsArray);
  
  const matches: { cat: string; score: number; rawPartsCount: number }[] = [];
  
  for (const cat of categoriasNomes) {
    const c = cat.trim();
    if (!c) continue;
    
    const catWords = significantCategoryParts(normKey(c));
    if (catWords.length === 0) continue;
    
    let allFound = true;
    for (const cw of catWords) {
      if (!textWords.has(cw)) {
        allFound = false;
        break;
      }
    }
    
    if (allFound) {
      matches.push({ cat: c, score: catWords.length, rawPartsCount: c.length });
    }
  }
  
  if (matches.length > 0) {
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.rawPartsCount - a.rawPartsCount;
    });
    
    const bestCat = matches[0].cat;
    
    let rest = expandedText;
    const catWords = significantCategoryParts(normKey(bestCat));
    for (const cw of catWords) {
       const re = new RegExp(`\\b${escapeRe(cw)}\\b`, 'gi');
       rest = rest.replace(re, ' ');
    }
    rest = rest.replace(/\b(de|da|do|das|dos|e)\b/gi, ' ');
    rest = rest.replace(/\s+/g, ' ').trim();
    
    return { categoria: bestCat, rest };
  }
  
  return { categoria: null, rest: t }
}

/**
 * Todos os modelos citados no texto, na ordem em que aparecem (CRM + fallback comum).
 */
function findAllModelosOrdenados(raw: string, nomesModelos: string[]): string[] {
  const merged = [...new Set([...nomesModelos.map((s) => s.trim()).filter(Boolean), ...FALLBACK_MODELOS_BULK])]
  const modelosSorted = merged.sort((a, b) => b.length - a.length)
  const hits: { nome: string; idx: number }[] = []
  for (const nomeMod of modelosSorted) {
    const nm = norm(nomeMod)
    if (nm.length < 2 || /^\d{4}$/.test(nm)) continue
    const re = new RegExp(`\\b${escapeRe(nm)}\\b`, 'i')
    const m = raw.match(re)
    if (m && m.index !== undefined) {
      hits.push({ nome: nomeMod, idx: m.index })
    }
  }
  hits.sort((a, b) => a.idx - b.idx)
  const out: string[] = []
  const seen = new Set<string>()
  for (const h of hits) {
    const k = normKey(h.nome)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(h.nome)
  }
  return out
}

export type ParsedBulkMasterNome = {
  categoria_nome: string | null
  marca: string | null
  modelo_texto: string
  ano_inicio: number | null
  ano_fim: number | null
  variacao: string | null
  motorizacao: string | null
}

/**
 * Interpreta um título longo de peça master (ex.: "parachoque dianteiro gol saveiro voyage g5 2008/2012")
 * para preencher categoria (prefixo), marca, vários modelos, anos e família G5 (variação).
 */
export function parseBulkMasterNomeCompleto(
  text: string,
  opts: {
    categoriasNomes: string[]
    nomesModelos: string[]
    nomesMarcas: string[]
    marcaPorModeloNome?: Map<string, string>
  }
): ParsedBulkMasterNome {
  const raw = text?.trim() || ''
  const empty: ParsedBulkMasterNome = {
    categoria_nome: null,
    marca: null,
    modelo_texto: '',
    ano_inicio: null,
    ano_fim: null,
    variacao: null,
    motorizacao: null,
  }
  if (!raw) return empty

  const { categoria, rest } = extrairCategoriaPrefixo(raw, opts.categoriasNomes)
  const textoParaModelos = rest.length > 0 ? rest : raw

  const base = parseNomeVeiculoPeca(raw, {
    nomesModelos: opts.nomesModelos,
    nomesMarcas: opts.nomesMarcas,
    marcaPorModeloNome: opts.marcaPorModeloNome,
  })

  const multi = findAllModelosOrdenados(textoParaModelos, opts.nomesModelos)
  let modelo_texto =
    multi.length > 0 ? multi.join(', ') : base.modelo ? base.modelo : ''

  const modelosParaMarca = multi.length > 0 ? multi : base.modelo ? [base.modelo] : []
  const marcasUniq = new Set<string>()
  for (const mod of modelosParaMarca) {
    const mk =
      opts.marcaPorModeloNome?.get(normKey(mod)) || inferirMarcaPorModelo(norm(mod))
    if (mk) marcasUniq.add(mk)
  }

  let marca: string | null = null
  if (marcasUniq.size === 1) {
    marca = [...marcasUniq][0]
  } else if (marcasUniq.size > 1) {
    marca = [...marcasUniq][0]
  } else {
    marca = base.marca
  }

  return {
    categoria_nome: categoria,
    marca,
    modelo_texto,
    ano_inicio: base.ano_inicio,
    ano_fim: base.ano_fim,
    variacao: base.familia,
    motorizacao: base.motorizacao,
  }
}
