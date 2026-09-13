/**
 * Funções centralizadas de formatação para o CRM (datas, moeda, números de pedido).
 */

const defaultDatePlaceholder = '---'
const defaultNullPlaceholder = '—'

/** Formata valor em Real (BRL). */
export function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Alias para fmtCurrency (compatibilidade com código que usa "fmt"). */
export const fmt = fmtCurrency

/** Formata apenas data (pt-BR). Aceita string, Date ou null/undefined. */
export function fmtDate(d: string | Date | null | undefined, placeholder = defaultDatePlaceholder): string {
  if (d == null) return placeholder
  try {
    const safeStr = typeof d === 'string' ? d.trim().replace(' ', 'T') : d
    const date = typeof safeStr === 'string' ? new Date(safeStr.includes('T') ? safeStr : safeStr + 'T00:00:00') : new Date(safeStr as Date)
    if (isNaN(date.getTime())) return placeholder
    return new Intl.DateTimeFormat('pt-BR').format(date)
  } catch {
    return placeholder
  }
}

/** Formata data e hora (pt-BR, short). */
export function fmtDateTime(d: string | Date | null | undefined, placeholder = defaultDatePlaceholder): string {
  if (d == null) return placeholder
  try {
    const safeStr = typeof d === 'string' ? d.trim().replace(' ', 'T') : d
    const date = new Date(safeStr as string | Date)
    if (isNaN(date.getTime())) return placeholder
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
  } catch {
    return placeholder
  }
}

/** Formata data e hora em uma linha curta (dd/mm hh:mm). */
export function fmtDateTimeShort(d: string | Date | null | undefined, placeholder = defaultDatePlaceholder): string {
  if (d == null) return placeholder
  try {
    const safeStr = typeof d === 'string' ? d.trim().replace(' ', 'T') : d
    const date = new Date(safeStr as string | Date)
    if (isNaN(date.getTime())) return placeholder
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  } catch {
    return placeholder
  }
}

/** Formata número de pedido com 6 dígitos (zeros à esquerda). */
export function formatNumPedido(num: number | null | undefined, emptyLabel = '------'): string {
  if (num == null) return emptyLabel
  const n = Number(num)
  if (isNaN(n)) return emptyLabel
  return String(n).padStart(6, '0')
}

/** Formata número de orçamento (pode ser sem zero-pad, conforme uso em Orcamentos). */
export function formatNumOrcamento(num: number | null | undefined, emptyLabel = '------'): string {
  if (num == null) return emptyLabel
  const n = Number(num)
  if (isNaN(n)) return emptyLabel
  return String(n)
}

/**
 * Texto "(Nx)" para cupom de venda: cartão crédito, boleto e a receber mostram sempre que houver parcelas ≥ 1;
 * demais formas só quando há mais de uma parcela.
 */
export function parcelasCupomSuffix(formaPagamento: string | undefined, parcelas: number | null | undefined): string {
  const n = Number(parcelas ?? 0)
  if (n < 1) return ''
  const fp = formaPagamento || ''
  if (fp === 'Cartão Crédito' || fp === 'Boleto' || fp === 'A Receber') return ` (${n}x)`
  if (n > 1) return ` (${n}x)`
  return ''
}

/** Número do pedido de compra (5 dígitos). */
export function formatNumCompraPedido(num: number | null | undefined, emptyLabel = '-----'): string {
  if (num == null) return emptyLabel
  const n = Number(num)
  if (isNaN(n)) return emptyLabel
  return String(n).padStart(5, '0')
}

/** Normaliza telefone brasileiro com suporte ao 9º dígito. */
export function normalizeBrazilianPhone(phone: string | null | undefined): string {
  if (!phone) return ""
  let digits = String(phone).replace(/\D/g, "")
  if (digits.startsWith("0")) digits = digits.slice(1)
  if (digits.length >= 10 && !digits.startsWith("55")) digits = "55" + digits

  if (digits.startsWith("55") && digits.length === 12) {
    const ddd = digits.slice(2, 4)
    const number = digits.slice(4)
    const firstDigit = number[0]
    // Conforme solicitado: fixo que começa com 3 deixa como está.
    // Outros (6, 7, 8, 9) ganham o 9 na frente.
    if (firstDigit !== "3") {
      digits = "55" + ddd + "9" + number
    }
  }
  return digits
}
