import { configuracoesApi } from "@/lib/api"

/** URLs da galeria do produto (imagem_urls ou fallback imagem_url). */
export function galleryUrlsFromProduto(p: {
    imagem_urls?: string[] | null
    imagem_url?: string | null
}): string[] {
    const arr = Array.isArray(p.imagem_urls) ? p.imagem_urls.filter((u): u is string => !!u && typeof u === "string") : []
    const uniq = [...new Set(arr.map((s) => s.trim()).filter(Boolean))]
    if (uniq.length > 0) return uniq
    const one = p.imagem_url?.trim()
    return one ? [one] : []
}

/** Quantas URLs em `next` não existiam em `prev` (novas fotos adicionadas). */
export function countNewImageUrls(prev: string[], next: string[]): number {
    const set = new Set(prev.map((s) => s.trim()).filter(Boolean))
    let n = 0
    for (const u of next) {
        const t = (u || "").trim()
        if (t && !set.has(t)) n++
    }
    return n
}

/**
 * Regista fotos novas colocadas num produto (estoque, massa, etc.).
 * Crédito: desmontador do produto, se houver; senão atendente logado / atendente_id do produto.
 */
export async function registarFotosProduto(opts: {
        produtoId: string
        quantidadeNovas: number
        desmontadorIdProduto?: string | null
        atendenteIdProduto?: string | null
        atendenteIdSessao?: string | null
        origem?: string | null
    }
): Promise<void> {
    const q = opts.quantidadeNovas
    if (!q || q <= 0) return

    const des = opts.desmontadorIdProduto?.trim() || null
    const att = opts.atendenteIdSessao?.trim() || opts.atendenteIdProduto?.trim() || null
    const origem = opts.origem?.trim() || null

    try {
        // Se houver atendente logado/sessão, ele ganha o crédito principal (conforme solicitação do usuário)
        if (att) {
            await configuracoesApi.registrarFotoContribuicao({
                actor_tipo: "atendente",
                atendente_id: att,
                desmontador_id: des, // Mantemos o desmontador como referência se houver
                alvo_tipo: "produto",
                produto_id: opts.produtoId,
                sucata_peca_id: null,
                sucata_id: null,
                quantidade_fotos: q,
                origem,
            })
            return
        }

        // Caso não haja atendente, mas haja desmontador (fallback)
        if (des) {
            await configuracoesApi.registrarFotoContribuicao({
                actor_tipo: "desmontador",
                atendente_id: null,
                desmontador_id: des,
                alvo_tipo: "produto",
                produto_id: opts.produtoId,
                sucata_peca_id: null,
                sucata_id: null,
                quantidade_fotos: q,
                origem,
            })
            return
        }

        if (!att) {
            console.warn("[foto_contribuicoes] Sem atendente nem desmontador para atribuir fotos do produto", opts.produtoId)
            return
        }

        await configuracoesApi.registrarFotoContribuicao({
            actor_tipo: "atendente",
            atendente_id: att,
            desmontador_id: null,
            alvo_tipo: "produto",
            produto_id: opts.produtoId,
            sucata_peca_id: null,
            sucata_id: null,
            quantidade_fotos: q,
            origem,
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn("[foto_contribuicoes] insert:", msg)
    }
}

/** Fotos novas adicionadas ao veículo (sucata), no modal de cadastro/edição. */
export async function registarFotosSucataVeiculo(opts: {
    sucataId: string
    quantidadeNovas: number
    atendenteId: string
    origem?: string | null
}): Promise<void> {
    const q = opts.quantidadeNovas
    if (!q || q <= 0) return
    const att = opts.atendenteId?.trim()
    if (!att) return

    try {
        await configuracoesApi.registrarFotoContribuicao({
            actor_tipo: "atendente",
            atendente_id: att,
            desmontador_id: null,
            alvo_tipo: "sucata_veiculo",
            produto_id: null,
            sucata_peca_id: null,
            sucata_id: opts.sucataId,
            quantidade_fotos: q,
            origem: opts.origem?.trim() || "sucatas_modal",
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn("[foto_contribuicoes] insert sucata veículo:", msg)
    }
}
