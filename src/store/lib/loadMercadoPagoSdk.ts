/**
 * Carrega o SDK JS v2 do Mercado Pago sob demanda (só quando o checkout de
 * pagamento online é montado) — evita baixar o script em toda página da loja.
 */
let loadPromise: Promise<void> | null = null

const SDK_URL = 'https://sdk.mercadopago.com/js/v2'

export function loadMercadoPagoSdk(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).MercadoPago) {
    return Promise.resolve()
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar o SDK do Mercado Pago')))
      return
    }
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Falha ao carregar o SDK do Mercado Pago'))
    document.head.appendChild(script)
  }).catch((err) => {
    loadPromise = null // permite tentar de novo numa próxima chamada
    throw err
  })

  return loadPromise
}
