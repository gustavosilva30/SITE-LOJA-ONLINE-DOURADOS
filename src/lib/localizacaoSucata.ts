/** Locais criados por `ensureLocalizacaoPecaNoVeiculo` (nome `Sucata (COD)`). */
export function isLocalizacaoSucataRow(row: {
    nome?: string | null
    origem_sucata?: boolean | null
}): boolean {
    if (row.origem_sucata === true) return true
    const n = (row.nome || "").trim()
    return /^sucata\s*\(/i.test(n)
}
