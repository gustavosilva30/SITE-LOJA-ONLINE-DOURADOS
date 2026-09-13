/** Dados mínimos da sucata para montar o nome do produto gerado a partir da categoria. */
export type SucataNomeProdutoInput = {
    nome_complemento_produto?: string | null
    marca: string
    modelo: string
    ano_fabricacao?: number | null
    ano_modelo?: number | null
}

/**
 * Nome do produto = categoria + (complemento editável OU marca/modelo/ano automáticos) + numeracao/detalhes.
 * Formato final em maiúsculas, até 60 caracteres (igual ao fluxo anterior).
 */
export function buildNomeProdutoPecaSucata(
    categoriaNome: string,
    s: SucataNomeProdutoInput,
    extras?: { numeracao?: string; detalhes?: string }
): string {
    const cat = String(categoriaNome ?? "").trim()
    const comp = String(s.nome_complemento_produto ?? "").trim()
    const numeracao = String(extras?.numeracao ?? "").trim()
    const detalhes = String(extras?.detalhes ?? "").trim()
    const suffix = [numeracao, detalhes].filter(Boolean).join(" ")

    if (comp) {
        return [cat, comp, suffix]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .toUpperCase()
            .trim()
            .slice(0, 60)
    }
    const anoPart =
        s.ano_fabricacao && s.ano_modelo
            ? `${s.ano_fabricacao}/${s.ano_modelo}`
            : s.ano_modelo ?? s.ano_fabricacao ?? ""
    return [cat, s.marca, s.modelo, anoPart, suffix]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .toUpperCase()
        .trim()
        .slice(0, 60)
}
