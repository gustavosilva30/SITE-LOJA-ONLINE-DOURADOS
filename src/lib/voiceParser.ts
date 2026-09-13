/**
 * Parser de texto falado → campos estruturados de pedido de compra.
 * 100% local, sem IA. Usa regex e heurísticas em português.
 *
 * Exemplos de fala aceita:
 * "parachoque dianteiro gol g5, 2 unidades"
 * "parachoque dianteiro gol g5 2 peças, farol esquerdo corolla 1 par"
 * "fornecedor distribuidora sul, parachoque dianteiro gol g5 3 unidades"
 * "observação entregar até sexta, parachoque gol 2 peças"
 */

export interface ParsedVoiceItem {
  descricao: string
  quantidade: number
  unidade: string
}

export interface ParsedVoiceOrder {
  fornecedorNome: string
  observacoes: string
  itens: ParsedVoiceItem[]
  rawText: string
}

// Palavras que indicam quantidade e sua unidade
const UNIT_PATTERNS: [RegExp, string][] = [
  [/\b(\d+)\s*par(?:es)?\b/gi, 'PAR'],
  [/\b(\d+)\s*jogo(?:s)?\b/gi, 'JG'],
  [/\b(\d+)\s*kit(?:s)?\b/gi, 'KIT'],
  [/\b(\d+)\s*metros?\b/gi, 'MT'],
  [/\b(\d+)\s*litros?\b/gi, 'LT'],
  [/\b(\d+)\s*pe[çc]as?\b/gi, 'PC'],
  [/\b(\d+)\s*unidades?\b/gi, 'UN'],
  [/\b(\d+)\s*un\b/gi, 'UN'],
]

// Palavras-gatilho para ignorar no início da fala
const SKIP_PREFIXES = [
  /^criar?\s+pedido\s+de\s+compra[,.]?\s*/i,
  /^novo\s+pedido[,.]?\s*/i,
  /^pedido\s+de\s+compra[,.]?\s*/i,
  /^registrar?\s+pedido[,.]?\s*/i,
]

// Extrai fornecedor da fala, se mencionado
function extractFornecedor(text: string): { fornecedor: string; rest: string } {
  const patterns = [
    /fornecedor[:\s]+([^,]+?)(?:,|$)/i,
    /empresa[:\s]+([^,]+?)(?:,|$)/i,
    /distribuidora[:\s]+([^,]+?)(?:,|$)/i,
    /do\s+fornecedor[:\s]+([^,]+?)(?:,|$)/i,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const fornecedor = m[1].trim()
      const rest = text.replace(m[0], '').trim()
      return { fornecedor, rest }
    }
  }
  return { fornecedor: '', rest: text }
}

// Extrai observação da fala, se mencionada
function extractObservacao(text: string): { obs: string; rest: string } {
  const patterns = [
    /observa[çc][aã]o[:\s]+([^,]+?)(?:,|$)/i,
    /obs[:\s]+([^,]+?)(?:,|$)/i,
    /nota[:\s]+([^,]+?)(?:,|$)/i,
    /anota[çc][aã]o[:\s]+([^,]+?)(?:,|$)/i,
  ]
  for (const pat of patterns) {
    const m = text.match(pat)
    if (m) {
      const obs = m[1].trim()
      const rest = text.replace(m[0], '').trim()
      return { obs, rest }
    }
  }
  return { obs: '', rest: text }
}

// Extrai quantidade e unidade de um segmento de texto
function extractQtyUnit(segment: string): { qtd: number; unit: string; cleaned: string } {
  for (const [pattern, unit] of UNIT_PATTERNS) {
    // Reset lastIndex para regex com /g
    pattern.lastIndex = 0
    const m = pattern.exec(segment)
    if (m) {
      pattern.lastIndex = 0
      const qtd = parseInt(m[1], 10)
      const cleaned = segment.replace(m[0], '').trim().replace(/\s+/g, ' ')
      return { qtd, unit, cleaned }
    }
  }

  // Tenta número isolado no final do segmento: "parachoque gol 3"
  const numEnd = segment.match(/^(.+?)\s+(\d+)\s*$/)
  if (numEnd) {
    return { qtd: parseInt(numEnd[2], 10), unit: 'UN', cleaned: numEnd[1].trim() }
  }

  // Tenta número isolado no início: "3 parachoque gol"
  const numStart = segment.match(/^(\d+)\s+(.+)$/)
  if (numStart) {
    return { qtd: parseInt(numStart[1], 10), unit: 'UN', cleaned: numStart[2].trim() }
  }

  return { qtd: 1, unit: 'UN', cleaned: segment.trim() }
}

// Divide o texto em segmentos de itens
function splitIntoSegments(text: string): string[] {
  // Divide por vírgula, "e também", "mais", "e mais"
  return text
    .split(/,\s*(?:e\s+também\s+|e\s+mais\s+)?|(?:\s+e\s+também\s+)|(?:\s+e\s+mais\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

export function parseVoiceOrder(rawText: string): ParsedVoiceOrder {
  let text = rawText.trim()

  // Remove prefixos de comando
  for (const prefix of SKIP_PREFIXES) {
    text = text.replace(prefix, '')
  }
  text = text.trim()

  const { fornecedor, rest: afterFornecedor } = extractFornecedor(text)
  const { obs, rest: afterObs } = extractObservacao(afterFornecedor)

  const segments = splitIntoSegments(afterObs)

  const itens: ParsedVoiceItem[] = segments
    .map((seg) => {
      const { qtd, unit, cleaned } = extractQtyUnit(seg)
      if (!cleaned) return null
      return {
        descricao: capitalize(cleaned),
        quantidade: Math.max(1, qtd),
        unidade: unit,
      }
    })
    .filter((i): i is ParsedVoiceItem => i !== null && i.descricao.length > 1)

  return {
    fornecedorNome: capitalize(fornecedor),
    observacoes: capitalize(obs),
    itens,
    rawText,
  }
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
