/**
 * Valida se um CNPJ é matematicamente válido (formato e dígitos verificadores).
 */
export function validarCNPJ(cnpj: string): boolean {
    const digits = cnpj.replace(/\D/g, '')
    
    if (digits.length !== 14) return false
    
    // Elimina CNPJs com todos os dígitos iguais (inválidos mas passam no cálculo)
    if (/^(\d)\1+$/.test(digits)) return false
    
    // Validação do primeiro dígito verificador
    let t = 12
    let d = digits.substring(0, t)
    let p1 = 5
    let p2 = 13
    let s = 0
    
    for (let i = t; i >= 1; i--) {
        const n = parseInt(d.charAt(t - i))
        s += n * p1
        p1--
        if (p1 < 2) p1 = 9
    }
    
    let r = s % 11
    let dv1 = r < 2 ? 0 : 11 - r
    if (parseInt(digits.charAt(12)) !== dv1) return false
    
    // Validação do segundo dígito verificador
    t = 13
    d = digits.substring(0, t)
    p1 = 6
    s = 0
    
    for (let i = t; i >= 1; i--) {
        const n = parseInt(d.charAt(t - i))
        s += n * p1
        p1--
        if (p1 < 2) p1 = 9
    }
    
    r = s % 11
    let dv2 = r < 2 ? 0 : 11 - r
    if (parseInt(digits.charAt(13)) !== dv2) return false
    
    return true
}
