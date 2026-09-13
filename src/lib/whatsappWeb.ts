/**
 * Abre o WhatsApp Web num novo separador com número e texto pré-preenchidos.
 * Usado quando o atendimento interno (API) não está disponível.
 */

/** Normaliza para dígitos com código 55 (Brasil), quando aplicável. */
export function normalizeBrazilPhoneForWa(input: string | null | undefined): string | null {
    let d = String(input || '').replace(/\D/g, '')
    if (!d) return null
    if (d.length === 10 || d.length === 11) {
        if (!d.startsWith('55')) d = '55' + d
    }
    // 55 + DDD (2) + 8–9 dígitos → 12–13 chars mínimo para BR
    if (d.length < 12 || d.length > 15) return null
    return d
}

export type OpenWhatsAppWebResult = { ok: true } | { ok: false; error: string }

/**
 * Abre https://web.whatsapp.com/send?phone=...&text=...
 */
export function openWhatsAppWeb(phoneRaw: string | null | undefined, text: string): OpenWhatsAppWebResult {
    const phone = normalizeBrazilPhoneForWa(phoneRaw)
    if (!phone) {
        return { ok: false, error: 'Telefone inválido ou ausente. Use DDD + número (ex.: 67999998888).' }
    }
    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    return { ok: true }
}

export type OpenWhatsAppAppResult = { ok: true } | { ok: false; error: string }

/**
 * Abre o WhatsApp do atendente (app desktop/mobile) usando o protocolo whatsapp://
 * Se já existir conversa com o número, abre direto na conversa.
 * Se não existir, abre nova conversa para enviar a mensagem.
 */
export function openWhatsAppApp(phoneRaw: string | null | undefined, text: string): OpenWhatsAppAppResult {
    const phone = normalizeBrazilPhoneForWa(phoneRaw)
    if (!phone) {
        return { ok: false, error: 'Telefone inválido ou ausente. Use DDD + número (ex.: 67999998888).' }
    }
    // Tenta primeiro o protocolo whatsapp:// para abrir o app nativo
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`
    // Fallback para WhatsApp Web se o app não estiver disponível
    const webUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`

    // Cria um iframe invisível para tentar abrir o protocolo sem afetar a página atual
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    try {
        // Tenta abrir via protocolo
        iframe.src = appUrl

        // Se não funcionar em 500ms, abre o WhatsApp Web
        setTimeout(() => {
            document.body.removeChild(iframe)
            // Verifica se o foco ainda está na página (app não abriu)
            if (document.hasFocus()) {
                window.open(webUrl, '_blank', 'noopener,noreferrer')
            }
        }, 500)
    } catch {
        document.body.removeChild(iframe)
        window.open(webUrl, '_blank', 'noopener,noreferrer')
    }

    return { ok: true }
}
